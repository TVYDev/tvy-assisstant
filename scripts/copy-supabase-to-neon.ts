/**
 * One-time copy of live Supabase rows into Neon.
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL.
 * Run after: pnpm db:apply-schema
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

const TABLES = {
  telegram_users: [
    "id",
    "telegram_user_id",
    "telegram_username",
    "shortcode",
    "first_name",
    "last_name",
    "created_at",
    "updated_at",
  ],
  debt_records: ["id", "shortcode", "owes_me", "i_owe", "created_at", "updated_at"],
  debt_items: [
    "id",
    "debt_record_id",
    "description",
    "amount",
    "date",
    "paid",
    "created_at",
    "updated_at",
  ],
  deposit_balances: ["shortcode", "balance", "created_at", "updated_at"],
  deposit_transactions: [
    "id",
    "shortcode",
    "type",
    "amount",
    "balance_after",
    "note",
    "created_at",
  ],
  youtube_subscription_members: ["id", "created_at", "updated_at"],
  youtube_subscription_months: [
    "id",
    "shortcode",
    "month",
    "paid",
    "created_at",
    "updated_at",
  ],
  youtube_fee_schedules: [
    "id",
    "fee",
    "effective_from",
    "effective_to",
    "created_at",
    "updated_at",
  ],
  app_config: ["key", "value", "created_at", "updated_at"],
  daily_fitness_logs: [
    "id",
    "log_date",
    "weight_kg",
    "gym_status",
    "gym_session",
    "gym_minutes",
    "created_at",
    "updated_at",
  ],
  fitness_log_sessions: [
    "telegram_user_id",
    "step",
    "weight_kg",
    "gym_session",
    "target_log_date",
    "expires_at",
    "created_at",
    "updated_at",
  ],
} as const;

async function fetchTable(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=*&offset=${from}&limit=${pageSize}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "count=exact",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to read ${table}: ${response.status} ${await response.text()}`);
    }
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function main() {
  const sql = neon(databaseUrl);

  for (const [table, knownColumns] of Object.entries(TABLES)) {
    const rows = await fetchTable(table);
    console.log(`${table}: ${rows.length} rows`);
    if (rows.length === 0) continue;

    const sourceColumns = new Set(Object.keys(rows[0]));
    const columns = knownColumns.filter((column) => sourceColumns.has(column));
    if (columns.length === 0) {
      throw new Error(`No overlapping columns for ${table}`);
    }
    const skipped = [...sourceColumns].filter(
      (column) => !knownColumns.includes(column as never),
    );
    if (skipped.length > 0) {
      console.log(`  skipping unknown columns: ${skipped.join(", ")}`);
    }
    const colSql = columns.map(quoteIdent).join(", ");
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

    for (const row of rows) {
      await sql.query(
        `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        columns.map((column) => row[column] ?? null),
      );
    }
  }

  await sql.query(
    "SELECT setval(pg_get_serial_sequence('debt_records', 'id'), COALESCE((SELECT MAX(id) FROM debt_records), 1))",
  );
  await sql.query(
    "SELECT setval(pg_get_serial_sequence('debt_items', 'id'), COALESCE((SELECT MAX(id) FROM debt_items), 1))",
  );
  await sql.query(
    "SELECT setval(pg_get_serial_sequence('deposit_transactions', 'id'), COALESCE((SELECT MAX(id) FROM deposit_transactions), 1))",
  );
  await sql.query(
    "SELECT setval(pg_get_serial_sequence('youtube_subscription_months', 'id'), COALESCE((SELECT MAX(id) FROM youtube_subscription_months), 1))",
  );
  await sql.query(
    "SELECT setval(pg_get_serial_sequence('youtube_fee_schedules', 'id'), COALESCE((SELECT MAX(id) FROM youtube_fee_schedules), 1))",
  );
  await sql.query(
    "SELECT setval(pg_get_serial_sequence('daily_fitness_logs', 'id'), COALESCE((SELECT MAX(id) FROM daily_fitness_logs), 1))",
  );
  await sql.query(
    "SELECT setval(pg_get_serial_sequence('telegram_users', 'id'), COALESCE((SELECT MAX(id) FROM telegram_users), 1))",
  );

  console.log("Copy complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
