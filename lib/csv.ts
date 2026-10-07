/** Quote every cell and neutralize spreadsheet formulas, including whitespace prefixes. */
export function csvCell(value: unknown) {
  // Typed finite numbers are safe and must remain numeric in spreadsheets.
  if (typeof value === "number" && Number.isFinite(value)) return '"' + String(value) + '"';
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csvDocument(rows: unknown[][]) {
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

