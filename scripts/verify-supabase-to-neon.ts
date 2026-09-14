/**
 * Compare row counts (and a few totals) between live Supabase and Neon.
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const supabaseKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const databaseUrl = requiredEnv("DATABASE_URL");

const TABLES = [
  "telegram_users",
  "debt_records",
  "debt_items",
  "deposit_balances",
  "deposit_transactions",
  "youtube_subscription_members",
  "youtube_subscription_months",
  "youtube_fee_schedules",
  "app_config",
  "daily_fitness_logs",
  "fitness_log_sessions",
] as const;

async function supabaseCount(table: string): Promise<number> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase count failed for ${table}: ${response.status}`);
  }
  const range = response.headers.get("content-range");
  const total = range?.split("/")[1];
  if (!total || total === "*") {
    throw new Error(`Supabase did not return a count for ${table}`);
  }
  return Number(total);
}

async function main() {
  const sql = neon(databaseUrl);
  let mismatches = 0;

  console.log("table".padEnd(34) + "supabase".padStart(10) + "neon".padStart(10) + "  status");
  console.log("-".repeat(64));

  for (const table of TABLES) {
    const source = await supabaseCount(table);
    const [row] = await sql.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    const target = Number((row as { count: number }).count);
    const ok = source === target;
    if (!ok) mismatches += 1;
    console.log(
      table.padEnd(34) +
        String(source).padStart(10) +
        String(target).padStart(10) +
        (ok ? "  ok" : "  MISMATCH"),
    );
  }

  const [deposit] = await sql.query(
    `SELECT COALESCE(SUM(balance), 0)::numeric AS total FROM deposit_balances`,
  );
  const [debt] = await sql.query(
    `SELECT COALESCE(SUM(owes_me), 0)::numeric AS total FROM debt_records`,
  );
  const [ytUnpaid] = await sql.query(
    `SELECT COUNT(*)::int AS count FROM youtube_subscription_months WHERE paid = false`,
  );

  console.log("");
  console.log("Neon spot checks");
  console.log(`  deposit_balances sum: ${Number((deposit as { total: string | number }).total)}`);
  console.log(`  debt_records owes_me sum: ${Number((debt as { total: string | number }).total)}`);
  console.log(
    `  unpaid youtube months: ${Number((ytUnpaid as { count: number }).count)}`,
  );

  if (mismatches > 0) {
    console.error(`\n${mismatches} table(s) do not match.`);
    process.exit(1);
  }

  console.log("\nAll table counts match.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
