import { supabase } from "./supabase";

export type DepositTransactionType = "add" | "reduce";

export interface DepositTransaction {
  id: number;
  shortcode: string;
  type: DepositTransactionType;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}

export class InsufficientDepositError extends Error {
  constructor(shortcode: string, requested: number, available: number) {
    super(
      `Insufficient deposit for ${shortcode}: requested $${requested.toFixed(2)}, available $${available.toFixed(2)}`,
    );
    this.name = "InsufficientDepositError";
  }
}

async function ensureDepositUserStub(shortcode: string): Promise<void> {
  const code = shortcode.toUpperCase();
  const now = new Date().toISOString();

  await supabase
    .from("telegram_users")
    .upsert(
      {
        shortcode: code,
        first_name: code,
        updated_at: now,
      },
      { onConflict: "shortcode", ignoreDuplicates: true },
    );

  await supabase
    .from("deposit_balances")
    .upsert(
      {
        shortcode: code,
        balance: 0,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "shortcode", ignoreDuplicates: true },
    );
}

async function insertDepositTransaction(params: {
  shortcode: string;
  type: DepositTransactionType;
  amount: number;
  balance_after: number;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.from("deposit_transactions").insert({
    shortcode: params.shortcode,
    type: params.type,
    amount: params.amount,
    balance_after: params.balance_after,
    note: params.note ?? null,
  });
  if (error)
    throw new Error(`Failed to insert deposit transaction: ${error.message}`);
}

export async function addDeposit(
  shortcode: string,
  amount: number,
  note?: string,
): Promise<number> {
  const code = shortcode.toUpperCase();
  await ensureDepositUserStub(code);

  const { data: newBalance, error: rpcError } = await supabase.rpc(
    "increment_deposit_balance",
    { p_shortcode: code, p_amount: amount },
  );
  if (rpcError)
    throw new Error(`Failed to add deposit: ${rpcError.message}`);

  const balance = Number(newBalance);
  await insertDepositTransaction({
    shortcode: code,
    type: "add",
    amount,
    balance_after: balance,
    note,
  });

  return balance;
}

export async function reduceDeposit(
  shortcode: string,
  amount: number,
  note?: string,
): Promise<number> {
  const code = shortcode.toUpperCase();
  const current = await getDepositBalanceByShortcode(code);
  if (current < amount) {
    throw new InsufficientDepositError(code, amount, current);
  }

  const { data: newBalance, error: rpcError } = await supabase.rpc(
    "decrement_deposit_balance",
    { p_shortcode: code, p_amount: amount },
  );
  if (rpcError) {
    if (rpcError.message.includes("insufficient_deposit_balance")) {
      throw new InsufficientDepositError(code, amount, current);
    }
    throw new Error(`Failed to reduce deposit: ${rpcError.message}`);
  }

  const balance = Number(newBalance);
  await insertDepositTransaction({
    shortcode: code,
    type: "reduce",
    amount,
    balance_after: balance,
    note,
  });

  return balance;
}

export async function applyDepositTowardPayment(
  shortcode: string,
  amount: number,
  note: string,
): Promise<{ applied: number; balance: number }> {
  if (amount <= 0) {
    return {
      applied: 0,
      balance: await getDepositBalanceByShortcode(shortcode),
    };
  }

  const balance = await getDepositBalanceByShortcode(shortcode);
  const applied = Math.min(balance, amount);
  if (applied <= 0) {
    return { applied: 0, balance };
  }

  const newBalance = await reduceDeposit(shortcode, applied, note);
  return { applied, balance: newBalance };
}

export async function getDepositBalanceByShortcode(
  shortcode: string,
): Promise<number> {
  const code = shortcode.toUpperCase();

  const { data, error } = await supabase
    .from("deposit_balances")
    .select("balance")
    .eq("shortcode", code)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch deposit balance: ${error.message}`);
  if (!data) return 0;
  return Number(data.balance);
}

export async function getDepositTransactions(
  shortcode: string,
  type?: DepositTransactionType,
): Promise<DepositTransaction[]> {
  const code = shortcode.toUpperCase();

  let query = supabase
    .from("deposit_transactions")
    .select("id, shortcode, type, amount, balance_after, note, created_at")
    .eq("shortcode", code)
    .order("created_at", { ascending: false });

  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error)
    throw new Error(`Failed to fetch deposit transactions: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as number,
    shortcode: row.shortcode as string,
    type: row.type as DepositTransactionType,
    amount: Number(row.amount),
    balance_after: Number(row.balance_after),
    note: (row.note as string | null) ?? null,
    created_at: row.created_at as string,
  }));
}

export async function getDepositReductionHistory(
  shortcode: string,
): Promise<DepositTransaction[]> {
  return getDepositTransactions(shortcode, "reduce");
}

export async function getDepositByUsername(username: string): Promise<number> {
  const normalized = username.startsWith("@") ? username.slice(1) : username;

  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("shortcode")
    .ilike("telegram_username", normalized)
    .maybeSingle();

  if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
  if (!user?.shortcode) return 0;

  return getDepositBalanceByShortcode(user.shortcode);
}

export async function getDepositByUserId(userId: number): Promise<number> {
  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("shortcode")
    .eq("telegram_user_id", userId)
    .maybeSingle();

  if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
  if (!user?.shortcode) return 0;

  return getDepositBalanceByShortcode(user.shortcode);
}

/** Resolve deposit balance: stub row by Telegram username first, then linked row by user id. */
export async function resolveDepositForTelegramUser(
  userId: number,
  username: string,
): Promise<number> {
  const handle = username.trim();
  if (handle) {
    const normalized = handle.startsWith("@") ? handle.slice(1) : handle;
    const { data: user, error: userError } = await supabase
      .from("telegram_users")
      .select("shortcode")
      .ilike("telegram_username", normalized)
      .maybeSingle();
    if (userError)
      throw new Error(`Failed to fetch user: ${userError.message}`);
    if (user?.shortcode) {
      return getDepositBalanceByShortcode(user.shortcode);
    }
  }
  if (userId) {
    return getDepositByUserId(userId);
  }
  return 0;
}

export async function getAllDepositTotals(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("deposit_balances")
    .select("shortcode, balance");

  if (error)
    throw new Error(`Failed to fetch all deposit balances: ${error.message}`);

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    totals.set(row.shortcode as string, Number(row.balance));
  }
  return totals;
}

/** @deprecated Use getDepositBalanceByShortcode */
export const getDepositTotalByShortcode = getDepositBalanceByShortcode;
