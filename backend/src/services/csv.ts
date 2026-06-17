/**
 * Tiny CSV builder shared by the export endpoints (maintenance jobs, PPMs,
 * parts, assets). RFC-4180 escaping: a field is quoted when it contains a
 * comma, double-quote or newline, and embedded quotes are doubled. Dates are
 * emitted as ISO-8601 so spreadsheets parse them unambiguously.
 *
 * Mirrors the inline escaping in routes/reports.ts (spills.csv) — kept as a
 * shared helper so every export produces identical, well-formed output.
 */

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a full CSV document (header + rows, trailing newline) from a column set. */
export function toCsv<T>(columns: Array<{ header: string; value: (row: T) => unknown }>, rows: T[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")).join("\n");
  return rows.length ? `${head}\n${body}\n` : `${head}\n`;
}

/** Download filename like `work-orders-2026-06-17.csv`. */
export function csvFilename(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
