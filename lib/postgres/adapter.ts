/** The existing domain layer uses D1's prepared statement shape. Only the SQL
 * constructs used by that layer are translated; user input is always bound. */
export type QueryResult = { rows: Record<string, unknown>[]; count: number };
export type Query = (sql: string, values: unknown[]) => Promise<QueryResult>;
export type Transaction = <T>(
  work: (query: Query) => Promise<T>,
  readOnly?: boolean,
) => Promise<T>;

export function postgresQuery(source: string) {
  let sql = source.replace(
    "date(CASE WHEN expires>? THEN expires ELSE ? END,'+' || ? || ' days')",
    "to_char((CASE WHEN expires>? THEN expires ELSE ? END)::date + (?::integer), 'YYYY-MM-DD')",
  );
  // Populate the actual table record type so integer/null fields retain types.
  const restore = sql.match(
    /^INSERT INTO (\w+) \(([^)]+)\) SELECT .* FROM json_each\(\?\) WHERE (.*)$/,
  );
  if (restore) {
    const [, table, fields, condition] = restore;
    sql = `INSERT INTO ${table} (${fields}) SELECT ${fields} FROM jsonb_populate_recordset(NULL::${table}, ?::jsonb) WHERE ${condition}`;
  }
  let index = 0;
  // SQL literals may contain question marks. Do not replace their contents.
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  );
}
function normalized(error: unknown): never {
  if ((error as { code?: string })?.code === "23505")
    throw new Error("UNIQUE constraint violated", { cause: error });
  throw error;
}
export function createDatabase(
  query: Query,
  transaction: Transaction,
): D1Database {
  class Statement {
    constructor(
      readonly sql: string,
      readonly args: unknown[] = [],
    ) {}
    bind(...args: unknown[]) {
      return new Statement(this.sql, args);
    }
    async execute(run: Query = query) {
      try {
        const result = await run(postgresQuery(this.sql), this.args);
        return {
          results: result.rows,
          success: true,
          meta: { changes: result.count },
        };
      } catch (error) {
        return normalized(error);
      }
    }
    async all<T>() {
      return this.execute() as unknown as Promise<D1Result<T>>;
    }
    async run<T>() {
      return this.all<T>();
    }
    async first<T>(column?: string): Promise<T | null> {
      const row = (await this.execute()).results[0];
      return ((column ? row?.[column] : row) as T) ?? null;
    }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    batch: (statements: Statement[]) => {
      if (!statements.length) return Promise.resolve([]);
      const readOnly = statements.every(
        (s) =>
          /^\s*(SELECT|WITH)\s/i.test(s.sql) &&
          !/\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(s.sql) &&
          !/\bFOR\s+(?:KEY\s+)?SHARE\b/i.test(s.sql) &&
          !/\b(record_cash|pg_advisory|nextval|setval)\s*\(/i.test(s.sql),
      );
      return transaction(async (run) => {
        if (readOnly && statements.length > 1) {
          // One round trip for independent reads, with the same snapshot and RLS.
          // Keep each ordered result as its own JSON array; all values stay bound.
          const sql =
            "SELECT " +
            statements
              .map(
                (s, i) =>
                  `(SELECT COALESCE(jsonb_agg(club_row), '[]'::jsonb) FROM (${s.sql}) AS club_row) AS batch_${i}`,
              )
              .join(", ");
          const result = await run(
            postgresQuery(sql),
            statements.flatMap((s) => s.args),
          );
          return statements.map((_, i) => {
            const rows = result.rows[0][`batch_${i}`] as Record<
              string,
              unknown
            >[];
            return {
              results: rows,
              success: true,
              meta: { changes: rows.length },
            };
          });
        }
        const out = [];
        for (const statement of statements)
          out.push(await statement.execute(run));
        return out;
      }, readOnly);
    },
  } as unknown as D1Database;
}
