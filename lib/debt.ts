import { eq, ilike } from "drizzle-orm";
import { getDb } from "./db";
import { decrementOwesMe, incrementOwesMe } from "./db/rpc";
import { debtItems, debtRecords, telegramUsers } from "./db/schema";

export interface DebtItem {
  id: number;
  description: string;
  amount: number;
  date: string;
  paid: boolean;
}

export interface DebtRecord {
  shortcode: string;
  name: string;
  owes_me: number;
  i_owe: number;
  items: DebtItem[];
}

function dbError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${message}`);
}

function displayName(
  user: { firstName?: string | null; lastName?: string | null } | null | undefined,
  fallback: string,
): string {
  if (!user) return fallback;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || fallback;
}

function mapItems(
  items: Array<{
    id: number;
    description: string;
    amount: number | string;
    date: string;
    paid: boolean;
  }>,
): DebtItem[] {
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    amount: Number(item.amount),
    date: item.date,
    paid: Boolean(item.paid),
  }));
}

export async function addDebt(
  shortcode: string,
  amount: number,
  description: string,
): Promise<void> {
  const db = getDb();
  const code = shortcode.toUpperCase();
  const today = new Date().toISOString().split("T")[0];
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
    .insert(debtRecords)
    .values({
      shortcode: code,
      owesMe: 0,
      iOwe: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: debtRecords.shortcode });

  let rec: { id: number } | undefined;
  try {
    rec = await db.query.debtRecords.findFirst({
      where: eq(debtRecords.shortcode, code),
      columns: { id: true },
    });
  } catch (error) {
    throw dbError("Failed to get debt record", error);
  }
  if (!rec) throw new Error("Failed to get debt record: not found");

  try {
    await db.insert(debtItems).values({
      debtRecordId: rec.id,
      description,
      amount,
      date: today,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    throw dbError("Failed to insert debt item", error);
  }

  try {
    await incrementOwesMe(code, amount);
  } catch (error) {
    throw dbError("Failed to update owes_me", error);
  }
}

export async function toggleDebtItemPaid(
  itemId: number,
  paid: boolean,
): Promise<{ shortcode: string; amount: number; newlyPaid: boolean } | null> {
  const db = getDb();

  let item:
    | { id: number; amount: number; paid: boolean; debtRecordId: number }
    | undefined;
  try {
    item = await db.query.debtItems.findFirst({
      where: eq(debtItems.id, itemId),
      columns: {
        id: true,
        amount: true,
        paid: true,
        debtRecordId: true,
      },
    });
  } catch (error) {
    throw dbError("Failed to fetch item", error);
  }
  if (!item) return null;

  const wasPaid = Boolean(item.paid);

  try {
    await db.update(debtItems).set({ paid }).where(eq(debtItems.id, itemId));
  } catch (error) {
    throw dbError("Failed to update item", error);
  }

  let rec: { shortcode: string } | undefined;
  try {
    rec = await db.query.debtRecords.findFirst({
      where: eq(debtRecords.id, item.debtRecordId),
      columns: { shortcode: true },
    });
  } catch (error) {
    throw dbError("Failed to fetch record", error);
  }
  if (!rec) throw new Error("Failed to fetch record: not found");

  const amount = Number(item.amount);

  if (paid && !wasPaid) {
    await decrementOwesMe(rec.shortcode, amount);
  } else if (!paid && wasPaid) {
    await incrementOwesMe(rec.shortcode, amount);
  }

  return { shortcode: rec.shortcode, amount, newlyPaid: paid && !wasPaid };
}

export async function getDebtByShortcode(
  shortcode: string,
): Promise<DebtRecord | null> {
  const db = getDb();
  const code = shortcode.toUpperCase();

  try {
    const data = await db.query.debtRecords.findFirst({
      where: eq(debtRecords.shortcode, code),
      with: {
        items: true,
        user: {
          columns: { firstName: true, lastName: true },
        },
      },
    });

    if (!data) return null;

    return {
      shortcode: code,
      name: displayName(data.user, code),
      owes_me: Number(data.owesMe),
      i_owe: Number(data.iOwe),
      items: mapItems(data.items),
    };
  } catch (error) {
    throw dbError("Failed to fetch debt", error);
  }
}

export async function markAllPaid(shortcode: string): Promise<void> {
  const db = getDb();
  const code = shortcode.toUpperCase();

  let rec: { id: number } | undefined;
  try {
    rec = await db.query.debtRecords.findFirst({
      where: eq(debtRecords.shortcode, code),
      columns: { id: true },
    });
  } catch (error) {
    throw dbError("Failed to find record", error);
  }
  if (!rec) throw new Error(`No debt record for ${code}`);

  await db.delete(debtItems).where(eq(debtItems.debtRecordId, rec.id));
  await db
    .update(debtRecords)
    .set({ owesMe: 0, iOwe: 0 })
    .where(eq(debtRecords.shortcode, code));
}

export async function cancelDebtItem(
  itemId: number,
): Promise<{ shortcode: string; amount: number } | null> {
  const db = getDb();

  let item: { id: number; amount: number; debtRecordId: number } | undefined;
  try {
    item = await db.query.debtItems.findFirst({
      where: eq(debtItems.id, itemId),
      columns: { id: true, amount: true, debtRecordId: true },
    });
  } catch (error) {
    throw dbError("Failed to fetch item", error);
  }
  if (!item) return null;

  let rec: { shortcode: string } | undefined;
  try {
    rec = await db.query.debtRecords.findFirst({
      where: eq(debtRecords.id, item.debtRecordId),
      columns: { shortcode: true },
    });
  } catch (error) {
    throw dbError("Failed to fetch record", error);
  }
  if (!rec) throw new Error("Failed to fetch record: not found");

  const amount = Number(item.amount);
  await db.delete(debtItems).where(eq(debtItems.id, itemId));
  await decrementOwesMe(rec.shortcode, amount);

  return { shortcode: rec.shortcode, amount };
}

export async function updateDebtItem(
  itemId: number,
  newAmount: number,
  newDescription: string,
): Promise<{ shortcode: string; oldAmount: number; newAmount: number } | null> {
  const db = getDb();

  let item:
    | { id: number; amount: number; paid: boolean; debtRecordId: number }
    | undefined;
  try {
    item = await db.query.debtItems.findFirst({
      where: eq(debtItems.id, itemId),
      columns: {
        id: true,
        amount: true,
        paid: true,
        debtRecordId: true,
      },
    });
  } catch (error) {
    throw dbError("Failed to fetch item", error);
  }
  if (!item) return null;

  const oldAmount = Number(item.amount);
  const isPaid = Boolean(item.paid);

  let rec: { shortcode: string } | undefined;
  try {
    rec = await db.query.debtRecords.findFirst({
      where: eq(debtRecords.id, item.debtRecordId),
      columns: { shortcode: true },
    });
  } catch (error) {
    throw dbError("Failed to fetch record", error);
  }
  if (!rec) throw new Error("Failed to fetch record: not found");

  try {
    await db
      .update(debtItems)
      .set({ amount: newAmount, description: newDescription })
      .where(eq(debtItems.id, itemId));
  } catch (error) {
    throw dbError("Failed to update item", error);
  }

  if (!isPaid) {
    const diff = newAmount - oldAmount;
    if (diff > 0) {
      await incrementOwesMe(rec.shortcode, diff);
    } else if (diff < 0) {
      await decrementOwesMe(rec.shortcode, -diff);
    }
  }

  return { shortcode: rec.shortcode, oldAmount, newAmount };
}

export async function getDebtByUsername(
  username: string,
): Promise<DebtRecord | null> {
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
  if (!user?.shortcode) return null;

  return getDebtByShortcode(user.shortcode);
}

export async function getDebtByUserId(
  userId: number,
): Promise<DebtRecord | null> {
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
  if (!user?.shortcode) return null;

  return getDebtByShortcode(user.shortcode);
}

export async function getAllDebtRecords(): Promise<DebtRecord[]> {
  const db = getDb();

  try {
    const rows = await db.query.debtRecords.findMany({
      with: {
        items: true,
        user: {
          columns: { firstName: true, lastName: true },
        },
      },
      orderBy: (table, { asc }) => [asc(table.shortcode)],
    });

    return rows.map((row) => ({
      shortcode: row.shortcode,
      name: displayName(row.user, row.shortcode),
      owes_me: Number(row.owesMe),
      i_owe: Number(row.iOwe),
      items: mapItems(row.items),
    }));
  } catch (error) {
    throw dbError("Failed to fetch all debts", error);
  }
}
