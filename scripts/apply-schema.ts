import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

function splitSql(sqlText: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollar = false;

  for (let i = 0; i < sqlText.length; i++) {
    if (sqlText.startsWith("$$", i)) {
      inDollar = !inDollar;
      current += "$$";
      i += 1;
      continue;
    }
    if (sqlText[i] === ";" && !inDollar) {
      const trimmed = current.replace(/^(?:\s*--[^\n]*\n)+/, "").trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += sqlText[i];
  }

  const trimmed = current.replace(/^(?:\s*--[^\n]*\n)+/, "").trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

async function main() {
  const sqlFile = resolve(process.cwd(), "drizzle/0000_baseline.sql");
  const statements = splitSql(readFileSync(sqlFile, "utf8"));
  const query = neon(databaseUrl);

  for (const statement of statements) {
    await query.query(statement);
  }

  console.log(`Applied ${statements.length} statements from drizzle/0000_baseline.sql`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
