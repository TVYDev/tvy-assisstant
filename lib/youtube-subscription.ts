import { and, asc, count, eq, ilike, inArray, sql } from "drizzle-orm";
import type { YoutubeMonthCharge } from "./youtube-fee";
import {
  formatReminderMonthFeeBreakdown,
  formatReminderMonthFeeSuffix,
} from "./youtube-fee";
import { getDb } from "./db";
import { insertYoutubeMonthsCurrent } from "./db/rpc";
import {
  appConfig,
  debtRecords,
  depositBalances,
  depositTransactions,
  telegramUsers,
  youtubeSubscriptionMembers,
  youtubeSubscriptionMonths,
} from "./db/schema";

export interface SubscriptionMember {
  id: string; // shortcode
  unpaid_count: number;
}

export interface SubscriptionMonth {
  id: number;
  shortcode: string;
  month: string; // YYYY-MM-DD
  paid: boolean;
}

export interface TelegramUser {
  telegram_user_id: number;
  telegram_username?: string;
  shortcode?: string;
  first_name: string;
  last_name?: string;
}

function dbError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${message}`);
}

export async function upsertTelegramUser(user: TelegramUser): Promise<void> {
  await getDb()
    .insert(telegramUsers)
    .values({
      telegramUserId: user.telegram_user_id,
      telegramUsername: user.telegram_username ?? null,
      firstName: user.first_name,
      lastName: user.last_name ?? null,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: telegramUsers.telegramUserId,
      set: {
        telegramUsername: user.telegram_username ?? null,
        firstName: user.first_name,
        lastName: user.last_name ?? null,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function updateTelegramUserField(
  shortcode: string,
  field:
    | "first_name"
    | "last_name"
    | "shortcode"
    | "telegram_username"
    | "telegram_user_id",
  value: string,
): Promise<boolean> {
  const db = getDb();
  const code = shortcode.toUpperCase();

  if (field === "shortcode") {
    const newCode = value.toUpperCase();
    try {
      await db
        .update(telegramUsers)
        .set({ shortcode: newCode })
        .where(eq(telegramUsers.shortcode, code));
      await Promise.all([
        db
          .update(debtRecords)
          .set({ shortcode: newCode })
          .where(eq(debtRecords.shortcode, code)),
        db
          .update(depositBalances)
          .set({ shortcode: newCode })
          .where(eq(depositBalances.shortcode, code)),
        db
          .update(depositTransactions)
          .set({ shortcode: newCode })
          .where(eq(depositTransactions.shortcode, code)),
        db
          .update(youtubeSubscriptionMonths)
          .set({ shortcode: newCode })
          .where(eq(youtubeSubscriptionMonths.shortcode, code)),
        db
          .update(youtubeSubscriptionMembers)
          .set({ id: newCode })
          .where(eq(youtubeSubscriptionMembers.id, code)),
      ]);
    } catch (error) {
      throw dbError("Failed to update shortcode", error);
    }
  } else if (field === "telegram_user_id") {
    const trimmed = value.trim();
    const lowered = trimmed.toLowerCase();
    const clearTokens = ["", "null", "none", "clear"];
    const newId = clearTokens.includes(lowered)
      ? null
      : (() => {
          const n = parseInt(trimmed, 10);
          if (Number.isNaN(n) || n <= 0) {
            throw new Error(
              "telegram_user_id must be a positive integer (Telegram numeric id), or one of: null, none, clear",
            );
          }
          return n;
        })();
    try {
      await db
        .update(telegramUsers)
        .set({ telegramUserId: newId })
        .where(eq(telegramUsers.shortcode, code));
    } catch (error) {
      throw dbError(`Failed to update ${field}`, error);
    }
  } else {
    const patch =
      field === "first_name"
        ? { firstName: value }
        : field === "last_name"
          ? { lastName: value }
          : { telegramUsername: value };
    try {
      await db
        .update(telegramUsers)
        .set(patch)
        .where(eq(telegramUsers.shortcode, code));
    } catch (error) {
      throw dbError(`Failed to update ${field}`, error);
    }
  }

  return true;
}

export interface TelegramUserRow {
  shortcode: string | null;
  telegram_user_id: number | null;
  telegram_username: string | null;
  first_name: string;
  last_name: string | null;
}

export async function getAllTelegramUsers(): Promise<TelegramUserRow[]> {
  const db = getDb();

  try {
    const data = await db
      .select({
        shortcode: telegramUsers.shortcode,
        telegramUserId: telegramUsers.telegramUserId,
        telegramUsername: telegramUsers.telegramUsername,
        firstName: telegramUsers.firstName,
        lastName: telegramUsers.lastName,
      })
      .from(telegramUsers)
      .orderBy(sql`${telegramUsers.shortcode} ASC NULLS LAST`);

    return data.map((row) => ({
      shortcode: row.shortcode,
      telegram_user_id: row.telegramUserId,
      telegram_username: row.telegramUsername,
      first_name: row.firstName,
      last_name: row.lastName,
    }));
  } catch (error) {
    throw dbError("Failed to fetch users", error);
  }
}

export async function getConfig(key: string): Promise<string> {
  const db = getDb();

  try {
    const data = await db.query.appConfig.findFirst({
      where: eq(appConfig.key, key),
      columns: { value: true },
    });
    if (!data) throw new Error("not found");
    return data.value;
  } catch (error) {
    throw dbError(`Failed to fetch config "${key}"`, error);
  }
}

export async function getConfigOptional(key: string): Promise<string | null> {
  const db = getDb();

  try {
    const data = await db.query.appConfig.findFirst({
      where: eq(appConfig.key, key),
      columns: { value: true },
    });
    return data ? data.value : null;
  } catch (error) {
    throw dbError(`Failed to fetch config "${key}"`, error);
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  try {
    await getDb()
      .insert(appConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value },
      });
  } catch (error) {
    throw dbError(`Failed to set config "${key}"`, error);
  }
}

async function getUnpaidCountForShortcode(shortcode: string): Promise<number> {
  const db = getDb();

  try {
    const [row] = await db
      .select({ value: count() })
      .from(youtubeSubscriptionMonths)
      .where(
        and(
          eq(youtubeSubscriptionMonths.shortcode, shortcode),
          eq(youtubeSubscriptionMonths.paid, false),
        ),
      );
    return Number(row?.value ?? 0);
  } catch (error) {
    throw dbError("Failed to count months", error);
  }
}

export async function getMemberByTelegramIdentity(
  userId: number,
): Promise<SubscriptionMember | null> {
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

  return getMemberByShortcode(user.shortcode);
}

export async function getMemberByUsername(
  username: string,
): Promise<SubscriptionMember | null> {
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

  return getMemberByShortcode(user.shortcode);
}

export async function getMemberByShortcode(
  shortcode: string,
): Promise<SubscriptionMember | null> {
  const db = getDb();

  try {
    const data = await db.query.youtubeSubscriptionMembers.findFirst({
      where: eq(youtubeSubscriptionMembers.id, shortcode),
      columns: { id: true },
    });
    if (!data) return null;

    const unpaid_count = await getUnpaidCountForShortcode(shortcode);
    return { id: data.id, unpaid_count };
  } catch (error) {
    throw dbError("Failed to fetch member", error);
  }
}

export async function getTelegramUsernameByShortcode(
  shortcode: string,
): Promise<string | null> {
  const db = getDb();

  try {
    const data = await db.query.telegramUsers.findFirst({
      where: eq(telegramUsers.shortcode, shortcode.toUpperCase()),
      columns: { telegramUsername: true, firstName: true },
    });
    if (!data) return null;
    return data.telegramUsername ?? data.firstName;
  } catch (error) {
    throw dbError("Failed to fetch telegram user", error);
  }
}

export async function getYouTubeMonthsForShortcode(
  shortcode: string,
): Promise<SubscriptionMonth[]> {
  const db = getDb();

  try {
    const data = await db
      .select({
        id: youtubeSubscriptionMonths.id,
        shortcode: youtubeSubscriptionMonths.shortcode,
        month: youtubeSubscriptionMonths.month,
        paid: youtubeSubscriptionMonths.paid,
      })
      .from(youtubeSubscriptionMonths)
      .where(eq(youtubeSubscriptionMonths.shortcode, shortcode.toUpperCase()))
      .orderBy(asc(youtubeSubscriptionMonths.month));

    return data;
  } catch (error) {
    throw dbError("Failed to fetch months", error);
  }
}

export async function toggleYouTubeMonthPaid(
  shortcode: string,
  month: string, // YYYY-MM
  paid: boolean,
): Promise<SubscriptionMonth | null> {
  const db = getDb();
  const normalized = shortcode.toUpperCase();
  const monthDate = `${month}-01`;

  try {
    const [data] = await db
      .update(youtubeSubscriptionMonths)
      .set({ paid })
      .where(
        and(
          eq(youtubeSubscriptionMonths.shortcode, normalized),
          eq(youtubeSubscriptionMonths.month, monthDate),
        ),
      )
      .returning({
        id: youtubeSubscriptionMonths.id,
        shortcode: youtubeSubscriptionMonths.shortcode,
        month: youtubeSubscriptionMonths.month,
        paid: youtubeSubscriptionMonths.paid,
      });
    return data ?? null;
  } catch (error) {
    throw dbError("Failed to toggle month", error);
  }
}

export async function markYouTubePaid(shortcode: string): Promise<void> {
  try {
    await getDb()
      .update(youtubeSubscriptionMonths)
      .set({ paid: true })
      .where(eq(youtubeSubscriptionMonths.shortcode, shortcode.toUpperCase()));
  } catch (error) {
    throw dbError("Failed to mark YouTube paid", error);
  }
}

export async function bulkToggleYouTubeMonthsPaid(
  shortcode: string,
  months: string[], // YYYY-MM[]
  paid: boolean,
): Promise<SubscriptionMonth[]> {
  const db = getDb();
  const normalized = shortcode.toUpperCase();
  const monthDates = months.map((m) => `${m}-01`);

  try {
    return await db
      .update(youtubeSubscriptionMonths)
      .set({ paid })
      .where(
        and(
          eq(youtubeSubscriptionMonths.shortcode, normalized),
          inArray(youtubeSubscriptionMonths.month, monthDates),
        ),
      )
      .returning({
        id: youtubeSubscriptionMonths.id,
        shortcode: youtubeSubscriptionMonths.shortcode,
        month: youtubeSubscriptionMonths.month,
        paid: youtubeSubscriptionMonths.paid,
      });
  } catch (error) {
    throw dbError("Failed to bulk toggle months", error);
  }
}

export async function toggleAllYouTubeMonthsPaid(
  shortcode: string,
  paid: boolean,
): Promise<SubscriptionMonth[]> {
  const db = getDb();
  const normalized = shortcode.toUpperCase();

  try {
    return await db
      .update(youtubeSubscriptionMonths)
      .set({ paid })
      .where(
        and(
          eq(youtubeSubscriptionMonths.shortcode, normalized),
          eq(youtubeSubscriptionMonths.paid, !paid),
        ),
      )
      .returning({
        id: youtubeSubscriptionMonths.id,
        shortcode: youtubeSubscriptionMonths.shortcode,
        month: youtubeSubscriptionMonths.month,
        paid: youtubeSubscriptionMonths.paid,
      });
  } catch (error) {
    throw dbError("Failed to toggle all months", error);
  }
}

export async function insertCurrentMonthForAll(): Promise<void> {
  try {
    await insertYoutubeMonthsCurrent();
  } catch (error) {
    throw dbError("Failed to insert current month", error);
  }
}

export async function getUnpaidMonthCountsAll(): Promise<SubscriptionMember[]> {
  const db = getDb();

  try {
    const [allMembers, unpaidRows] = await Promise.all([
      db
        .select({ id: youtubeSubscriptionMembers.id })
        .from(youtubeSubscriptionMembers)
        .orderBy(asc(youtubeSubscriptionMembers.id)),
      db
        .select({ shortcode: youtubeSubscriptionMonths.shortcode })
        .from(youtubeSubscriptionMonths)
        .where(eq(youtubeSubscriptionMonths.paid, false)),
    ]);

    const countMap = new Map<string, number>();
    for (const row of unpaidRows) {
      countMap.set(row.shortcode, (countMap.get(row.shortcode) ?? 0) + 1);
    }

    return allMembers.map((m) => ({
      id: m.id,
      unpaid_count: countMap.get(m.id) ?? 0,
    }));
  } catch (error) {
    throw dbError("Failed to fetch unpaid month counts", error);
  }
}

export function buildReminderMessage(
  members: { id: string; months: YoutubeMonthCharge[]; total: number }[],
  depositTotals: Map<string, number> = new Map(),
  options: { feeAnnouncement?: string } = {},
): string {
  type Row = {
    id: string;
    monthCharges: YoutubeMonthCharge[];
    months: number;
    total: number;
    deposit: number;
    net: number;
  };

  const rows: Row[] = [];

  for (const member of members) {
    if (member.months.length === 0) continue;
    const total = member.total;
    const deposit = depositTotals.get(member.id) ?? 0;
    const net = Math.max(total - deposit, 0);
    rows.push({
      id: member.id,
      monthCharges: member.months,
      months: member.months.length,
      total,
      deposit,
      net,
    });
  }

  if (rows.length === 0) {
    return "📺 YouTube: everyone's paid up! ✅";
  }

  const money = (n: number) => `$${n.toFixed(2)}`;
  const monthLabel = (n: number) => (n === 1 ? "1 month" : `${n} months`);
  const toPay = (amount: number) =>
    `<b>👉 To Pay ${money(amount)}</b>`;

  const personBlocks = rows.map((r) => {
    const settled = r.net === 0 && r.deposit > 0;
    const icon = settled ? "✅" : "⏳";
    const feeSuffix = formatReminderMonthFeeSuffix(r.monthCharges);
    const who = `${icon} <b>${r.id}</b> — ${monthLabel(r.months)}${feeSuffix}`;
    const feeBreakdown = formatReminderMonthFeeBreakdown(r.monthCharges);

    if (settled) {
      const lines = [`${who} — <b>Settled</b> (deposit ${money(r.deposit)})`];
      if (feeBreakdown) lines.push(`   ${feeBreakdown}`);
      return lines;
    }

    const lines = [`${who} — ${toPay(r.net)}`];
    if (feeBreakdown) lines.push(`   ${feeBreakdown}`);
    if (r.deposit > 0) {
      lines.push(`   deposit ${money(r.deposit)}`);
    }
    return lines;
  });

  const personLines = personBlocks.flatMap((block, i) =>
    i < personBlocks.length - 1 ? [...block, ""] : block,
  );

  const lines = ["📺 YouTube payment reminder"];
  if (options.feeAnnouncement) {
    lines.push("", options.feeAnnouncement);
  }
  lines.push("", ...personLines);

  return lines.join("\n");
}

/** Telegram photo captions use HTML for reminder formatting. */
export const REMINDER_PARSE_MODE = "HTML" as const;
