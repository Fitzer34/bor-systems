import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv, csvFilename } from "./csv.js";

test("csvCell — empty for null/undefined", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("csvCell — plain values pass through unquoted", () => {
  assert.equal(csvCell("hello"), "hello");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(false), "false");
});

test("csvCell — quotes fields containing comma, quote, CR or LF", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell("has\rreturn"), '"has\rreturn"');
  // Embedded double-quotes are doubled and the whole field quoted (RFC 4180).
  assert.equal(csvCell('she said "hi"'), '"she said ""hi"""');
});

test("csvCell — Date renders as ISO-8601", () => {
  assert.equal(csvCell(new Date("2026-06-17T09:30:00.000Z")), "2026-06-17T09:30:00.000Z");
});

test("toCsv — header-only when there are no rows", () => {
  const cols = [
    { header: "id", value: (r: { id: string }) => r.id },
    { header: "name", value: (r: { id: string }) => r.id },
  ];
  assert.equal(toCsv(cols, []), "id,name\n");
});

test("toCsv — emits header plus an escaped row per item with a trailing newline", () => {
  type Row = { id: string; title: string; qty: number; note: string | null };
  const rows: Row[] = [
    { id: "1", title: "Fix, urgently", qty: 3, note: null },
    { id: "2", title: 'Say "hi"', qty: 0, note: "ok" },
  ];
  const csv = toCsv<Row>(
    [
      { header: "id", value: (r) => r.id },
      { header: "title", value: (r) => r.title },
      { header: "qty", value: (r) => r.qty },
      { header: "note", value: (r) => r.note },
    ],
    rows,
  );
  assert.equal(csv, 'id,title,qty,note\n1,"Fix, urgently",3,\n2,"Say ""hi""",0,ok\n');
});

test("csvFilename — base plus today's date and .csv suffix", () => {
  assert.match(csvFilename("work-orders"), /^work-orders-\d{4}-\d{2}-\d{2}\.csv$/);
});
