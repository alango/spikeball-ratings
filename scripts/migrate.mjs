// Apply schema.sql to the database in DATABASE_URL.
// Run with:  npm run db:setup   (loads .env via node --env-file)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

// The Neon http driver runs one statement per call, so split on ';'. Strip '--'
// line comments first — they may contain semicolons (e.g. "truth; ratings ...")
// which would otherwise split mid-comment. (schema.sql has no string literals
// containing '--' or ';', so this is safe.)
const statements = schema
  .replace(/--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${statements.length} statements from schema.sql ...`);
for (const stmt of statements) {
  await sql.query(stmt);
}
console.log("Schema applied ✓");
