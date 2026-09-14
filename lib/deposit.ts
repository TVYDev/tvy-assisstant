import { and, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "./db";
import { decrementDepositBalance, incrementDepositBalance } from "./db/rpc";
import { depositBalances, depositTransactions, telegramUsers } from "./db/schema";

const DEPOSIT_TIMEZONE = "Asia/Phnom_Penh";

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

function dbError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${message}`);
}

async function ensureDepositUserStub(shortcode: string): Promise<void> {
  const db = getDb();
  const code = shortcode.toUpperCase();
  const now = new Date().toISOString();

  await db
    .insert(telegramUsers)
    .values({
      shortcode: code,
      firstName: code,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: telegramUsers.shortcode });

  await db
    .insert(depositBalances)
    .values({
      shortcode: code,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: depositBalances.shortcode });
}

async function insertDepositTransaction(params: {
  shortcode: string;
  type: DepositTransactionType;
  amount: number;
  balance_after: number;
  note?: string;
}): Promise<void> {
  try {
    await getDb().insert(depositTransactions).values({
      shortcode: params.shortcode,
      type: params.type,
      amount: params.amount,
      balanceAfter: params.balance_after,
      note: params.note ?? null,
    });
  } catch (error) {
    throw dbError("Failed to insert deposit transaction", error);
  }
}

export async function addDeposit(
  shortcode: string,
  amount: number,
  note?: string,
): Promise<number> {
  const code = shortcode.toUpperCase();
  await ensureDepositUserStub(code);

  let balance: number;
  try {
    balance = await incrementDepositBalance(code, amount);
  } catch (error) {
    throw dbError("Failed to add deposit", error);
  }

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

  let balance: number;
  try {
    balance = await decrementDepositBalance(code, amount);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("insufficient_deposit_balance")) {
      throw new InsufficientDepositError(code, amount, current);
    }
    throw dbError("Failed to reduce deposit", error);
  }

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
  const db = getDb();
  const code = shortcode.toUpperCase();

  try {
    const data = await db.query.depositBalances.findFirst({
      where: eq(depositBalances.shortcode, code),
      columns: { balance: true },
    });
    if (!data) return 0;
    return Number(data.balance);
  } catch (error) {
    throw dbError("Failed to fetch deposit balance", error);
  }
}

export async function getDepositTransactions(
  shortcode: string,
  type?: DepositTransactionType,
): Promise<DepositTransaction[]> {
  const db = getDb();
  const code = shortcode.toUpperCase();

  try {
    const rows = await db
      .select({
        id: depositTransactions.id,
        shortcode: depositTransactions.shortcode,
        type: depositTransactions.type,
        amount: depositTransactions.amount,
        balanceAfter: depositTransactions.balanceAfter,
        note: depositTransactions.note,
        createdAt: depositTransactions.createdAt,
      })
      .from(depositTransactions)
      .where(
        type
          ? and(
              eq(depositTransactions.shortcode, code),
              eq(depositTransactions.type, type),
            )
          : eq(depositTransactions.shortcode, code),
      )
      .orderBy(desc(depositTransactions.createdAt));

    return rows.map((row) => ({
      id: row.id,
      shortcode: row.shortcode,
      type: row.type as DepositTransactionType,
      amount: Number(row.amount),
      balance_after: Number(row.balanceAfter),
      note: row.note ?? null,
      created_at: row.createdAt,
    }));
  } catch (error) {
    throw dbError("Failed to fetch deposit transactions", error);
  }
}

export function formatDepositTransactionTimestamp(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEPOSIT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEPOSIT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} ${timePart}`;
}

export function formatDepositTransactionLine(tx: DepositTransaction): string {
  const when = formatDepositTransactionTimestamp(tx.created_at);
  const note = tx.note ? ` — ${tx.note}` : "";
  if (tx.type === "add") {
    return `  📈 +$${tx.amount.toFixed(2)} (${when}) → $${tx.balance_after.toFixed(2)} total${note}`;
  }
  return `  📉 -$${tx.amount.toFixed(2)} (${when}) → $${tx.balance_after.toFixed(2)} left${note}`;
}

export async function getDepositReductionHistory(
  shortcode: string,
): Promise<DepositTransaction[]> {
  return getDepositTransactions(shortcode, "reduce");
}

export async function getDepositByUsername(username: string): Promise<number> {
  const db = getDb();
  const normalized = username.startsWith("@") ? username.slice(1) : username;

  let user: { shortcode: string | null } | undefined;
  try {
    user = await db.query.telegramUsers.findFirst({
      where: ilike(telegramUsers.telegramUsername, normalized),
      columns: { shortcode: true },
    });
  } catch (error) {
    throw dbError("Failed to fetch user", error);
  }
  if (!user?.shortcode) return 0;

  return getDepositBalanceByShortcode(user.shortcode);
}

export async function getDepositByUserId(userId: number): Promise<number> {
  const db = getDb();

  let user: { shortcode: string | null } | undefined;
  try {
    user = await db.query.telegramUsers.findFirst({
      where: eq(telegramUsers.telegramUserId, userId),
      columns: { shortcode: true },
    });
  } catch (error) {
    throw dbError("Failed to fetch user", error);
  }
  if (!user?.shortcode) return 0;

  return getDepositBalanceByShortcode(user.shortcode);
}

/** Resolve deposit balance: stub row by Telegram username first, then linked row by user id. */
export async function resolveDepositForTelegramUser(
  userId: number,
  username: string,
): Promise<number> {
  const db = getDb();
  const handle = username.trim();
  if (handle) {
    const normalized = handle.startsWith("@") ? handle.slice(1) : handle;
    let user: { shortcode: string | null } | undefined;
    try {
      user = await db.query.telegramUsers.findFirst({
        where: ilike(telegramUsers.telegramUsername, normalized),
        columns: { shortcode: true },
      });
    } catch (error) {
      throw dbError("Failed to fetch user", error);
    }
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
  const db = getDb();

  try {
    const data = await db
      .select({
        shortcode: depositBalances.shortcode,
        balance: depositBalances.balance,
      })
      .from(depositBalances);

    const totals = new Map<string, number>();
    for (const row of data) {
      totals.set(row.shortcode, Number(row.balance));
    }
    return totals;
  } catch (error) {
    throw dbError("Failed to fetch all deposit balances", error);
  }
}

/** @deprecated Use getDepositBalanceByShortcode */
export const getDepositTotalByShortcode = getDepositBalanceByShortcode;
