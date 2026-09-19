import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const databaseUrl = requiredEnv("DATABASE_URL");

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
  const drizzleDir = resolve(process.cwd(), "drizzle");
  const sqlFiles = readdirSync(drizzleDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (sqlFiles.length === 0) {
    throw new Error("No SQL files found in drizzle/");
  }

  const query = neon(databaseUrl);
  let totalStatements = 0;

  for (const fileName of sqlFiles) {
    const sqlFile = resolve(drizzleDir, fileName);
    const statements = splitSql(readFileSync(sqlFile, "utf8"));
    for (const statement of statements) {
      await query.query(statement);
    }
    totalStatements += statements.length;
    console.log(`Applied ${statements.length} statements from drizzle/${fileName}`);
  }

  console.log(`Applied ${totalStatements} statements from ${sqlFiles.length} SQL file(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
