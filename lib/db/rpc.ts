import { sql } from "drizzle-orm";
import { getDb } from "./index";

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function firstScalar<T>(result: unknown): T {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Record<string, unknown>[] }).rows ?? []);
  const row = rows[0];
  if (!row) throw new Error("RPC returned no value");
  if ("value" in row) return row.value as T;
  return Object.values(row)[0] as T;
}

async function callNumericRpc(
  query: ReturnType<typeof sql>,
): Promise<number> {
  try {
    const result = await getDb().execute(query);
    return Number(firstScalar<number | string>(result));
  } catch (error) {
    throw asError(error);
  }
}

export async function incrementOwesMe(
  shortcode: string,
  amount: number,
): Promise<number> {
  return callNumericRpc(
    sql`select increment_owes_me(${shortcode}::text, ${amount}::numeric) as value`,
  );
}

export async function decrementOwesMe(
  shortcode: string,
  amount: number,
): Promise<number> {
  return callNumericRpc(
    sql`select decrement_owes_me(${shortcode}::text, ${amount}::numeric) as value`,
  );
}

export async function incrementDepositBalance(
  shortcode: string,
  amount: number,
): Promise<number> {
  return callNumericRpc(
    sql`select increment_deposit_balance(${shortcode}::text, ${amount}::numeric) as value`,
  );
}

export async function decrementDepositBalance(
  shortcode: string,
  amount: number,
): Promise<number> {
  return callNumericRpc(
    sql`select decrement_deposit_balance(${shortcode}::text, ${amount}::numeric) as value`,
  );
}

export async function insertYoutubeMonthsCurrent(): Promise<void> {
  await getDb().execute(sql`select insert_youtube_months_current()`);
}
