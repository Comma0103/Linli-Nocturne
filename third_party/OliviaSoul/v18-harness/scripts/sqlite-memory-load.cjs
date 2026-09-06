"use strict";
const { DatabaseSync } = require("node:sqlite");
const { writeFileSync } = require("node:fs");

const dbPath = process.argv[2];
const outPath = process.argv[3];
if (!dbPath || !outPath) {
  process.stderr.write("usage: sqlite-memory-load.cjs <db> <out.json>\n");
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const byMd5 = {};
for (const row of db.prepare(`
  SELECT content_md5, summary
  FROM letter_summaries
  WHERE summary IS NOT NULL AND trim(summary) != ''
`).all()) {
  const md5 = String(row.content_md5 ?? "");
  const summary = String(row.summary ?? "").trim();
  if (md5 && summary && !byMd5[md5]) byMd5[md5] = summary;
}
const bulks = db.prepare(`
  SELECT hashes_json AS hashes, summary
  FROM memory_bulk_summaries
  WHERE summary IS NOT NULL AND trim(summary) != ''
`).all().map(row => ({
  hashes: String(row.hashes ?? ""),
  summary: String(row.summary ?? "").trim(),
})).filter(row => row.hashes && row.summary);
db.close();
writeFileSync(outPath, `${JSON.stringify({ byMd5, bulks })}\n`, "utf8");
