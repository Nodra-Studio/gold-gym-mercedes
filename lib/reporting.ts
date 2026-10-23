export const reportActivities = [
  { id: "gym", name: "Gimnasio" },
  { id: "padel", name: "Pádel" },
  { id: "pilates", name: "Pilates" },
  { id: "unclassified", name: "Sin actividad registrada" },
] as const;
export type ReportSelection = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  venue: string;
  activity: string;
  category: string;
};
export type FinancialTotals = {
  incoming: number;
  outgoing: number;
  balance: number;
  count: number;
};
export type FinancialGroup = FinancialTotals & { key: string };
export type FinancialPeriod = {
  from: string;
  to: string;
  days: number;
  totals: FinancialTotals;
  months: FinancialGroup[];
  venues: FinancialGroup[];
  categories: FinancialGroup[];
};
export type FinancialReport = {
  selection: ReportSelection;
  generatedAt: string;
  current: FinancialPeriod;
  comparison: FinancialPeriod;
  categoryOptions: string[];
};
export type FinancialRow = {
  day: string;
  venue: string | null;
  activity: string;
  category: string;
  incoming: number;
  outgoing: number;
  count: number;
};
const shift = (day: string, amount: number) =>
  new Date(Date.parse(day + "T00:00:00Z") + amount * 86400000)
    .toISOString()
    .slice(0, 10);
function validDay(day: string) {
  return (
    /^\d{4}-\d\d-\d\d$/.test(day) &&
    day >= "2000-01-01" &&
    day <= "2100-12-31" &&
    !Number.isNaN(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function reportSelection(
  query: URLSearchParams,
  today: string,
): ReportSelection {
  const from = query.get("from") ?? today.slice(0, 8) + "01",
    to = query.get("to") ?? today;
  const validatePeriod = (a: string, b: string) => {
    if (
      !validDay(a) ||
      !validDay(b) ||
      a > b ||
      (Date.parse(b) - Date.parse(a)) / 86400000 > 365
    )
      throw Error(
        "Elegí períodos válidos de hasta 366 días entre 2000 y 2100.",
      );
  };
  validatePeriod(from, to);
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const compareFrom = query.get("compareFrom") ?? shift(from, -days),
    compareTo = query.get("compareTo") ?? shift(from, -1);
  validatePeriod(compareFrom, compareTo);
  const venue = query.get("venue") ?? "",
    activity = query.get("activity") ?? "",
    category = query.get("category") ?? "";
  if (
    venue &&
    !["calle30", "calle23", "velez", "pilates", "unknown"].includes(venue)
  )
    throw Error("Sede inválida.");
  if (activity && !reportActivities.some((a) => a.id === activity))
    throw Error("Actividad inválida.");
  if (category.length > 60 || /[\u0000-\u001f]/.test(category))
    throw Error("Categoría inválida.");
  return { from, to, compareFrom, compareTo, venue, activity, category };
}
/** Values always remain bound. Cash reversals reduce their original income or expense bucket. */
export function financialQuery(owner: string, selection: ReportSelection) {
  const first =
    selection.from < selection.compareFrom
      ? selection.from
      : selection.compareFrom;
  const last =
    selection.to > selection.compareTo ? selection.to : selection.compareTo;
  const begin = new Date(first + "T00:00:00-03:00").toISOString(),
    end = new Date(shift(last, 1) + "T00:00:00-03:00").toISOString();
  const sql = `WITH ledger AS (
    SELECT to_char(p.created_at::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS day,p.venue,
      p.activity AS activity,'Cuotas' AS category,p.amount AS incoming,0 AS outgoing
      FROM payments p WHERE p.owner=? AND p.voided=0 AND p.created_at>=? AND p.created_at<?
    UNION ALL SELECT to_char(p.created_at::timestamptz AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD'),p.venue,'padel','Pádel',p.amount,0
      FROM booking_payments p WHERE p.owner=? AND p.voided=0 AND p.created_at>=? AND p.created_at<?
    UNION ALL SELECT c.day,c.venue,c.activity,c.category,
      CASE WHEN COALESCE(o.kind,c.kind)='expense' THEN 0 ELSE c.amount END,
      CASE WHEN COALESCE(o.kind,c.kind)='expense' THEN -c.amount ELSE 0 END
      FROM cash_entries c LEFT JOIN cash_entries o ON o.id=c.reverses AND o.owner=c.owner
      WHERE c.owner=? AND c.day>=? AND c.day<=?
  ) SELECT day,venue,activity,category,SUM(incoming)::float8 AS incoming,SUM(outgoing)::float8 AS outgoing,COUNT(*)::integer AS count
    FROM ledger WHERE ((day>=? AND day<=?) OR (day>=? AND day<=?))
    ${selection.venue === "unknown" ? "AND venue IS NULL" : selection.venue ? "AND venue=?" : ""}
    ${selection.activity ? "AND activity=?" : ""}
    GROUP BY day,venue,activity,category ORDER BY day,venue,activity,category`;
  return {
    sql,
    args: [
      owner,
      begin,
      end,
      owner,
      begin,
      end,
      owner,
      first,
      last,
      selection.from,
      selection.to,
      selection.compareFrom,
      selection.compareTo,
      ...(selection.venue && selection.venue !== "unknown"
        ? [selection.venue]
        : []),
      ...(selection.activity ? [selection.activity] : []),
    ],
  };
}
const emptyTotals = (): FinancialTotals => ({
  incoming: 0,
  outgoing: 0,
  balance: 0,
  count: 0,
});
function add(target: FinancialTotals, row: FinancialRow) {
  target.incoming += Number(row.incoming);
  target.outgoing += Number(row.outgoing);
  target.balance = target.incoming - target.outgoing;
  target.count += Number(row.count);
}
function period(
  rows: FinancialRow[],
  from: string,
  to: string,
): FinancialPeriod {
  const totals = emptyTotals(),
    monthMap = new Map<string, FinancialGroup>(),
    venues = new Map<string, FinancialGroup>(),
    categories = new Map<string, FinancialGroup>();
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); ) {
    monthMap.set(month, { key: month, ...emptyTotals() });
    const [year, m] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7);
  }
  for (const row of rows) {
    if (row.day < from || row.day > to) continue;
    add(totals, row);
    for (const [map, key] of [
      [monthMap, row.day.slice(0, 7)],
      [venues, row.venue ?? "unknown"],
      [categories, row.category],
    ] as const) {
      const group = map.get(key) ?? { key, ...emptyTotals() };
      add(group, row);
      map.set(key, group);
    }
  }
  return {
    from,
    to,
    days: (Date.parse(to) - Date.parse(from)) / 86400000 + 1,
    totals,
    months: [...monthMap.values()],
    venues: [...venues.values()],
    categories: [...categories.values()].sort((a, b) =>
      a.key.localeCompare(b.key, "es"),
    ),
  };
}
export function financialReport(
  rows: FinancialRow[],
  selection: ReportSelection,
): FinancialReport {
  const filtered = selection.category
    ? rows.filter((r) => r.category === selection.category)
    : rows;
  return {
    selection,
    generatedAt: new Date().toISOString(),
    current: period(filtered, selection.from, selection.to),
    comparison: period(filtered, selection.compareFrom, selection.compareTo),
    categoryOptions: [...new Set(rows.map((r) => r.category))].sort((a, b) =>
      a.localeCompare(b, "es"),
    ),
  };
}
export function percentageChange(
  current: number,
  previous: number,
): number | null {
  return previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}
