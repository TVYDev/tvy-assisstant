import { supabase } from "./supabase";

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

export async function upsertTelegramUser(user: TelegramUser): Promise<void> {
  await supabase.from("telegram_users").upsert(
    {
      telegram_user_id: user.telegram_user_id,
      telegram_username: user.telegram_username ?? null,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id", ignoreDuplicates: false },
  );
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
  const code = shortcode.toUpperCase();

  if (field === "shortcode") {
    const newCode = value.toUpperCase();
    // Cascade manually: update related tables first (no FK cascade assumed)
    await Promise.all([
      supabase
        .from("debt_records")
        .update({ shortcode: newCode })
        .eq("shortcode", code),
      supabase
        .from("deposit_balances")
        .update({ shortcode: newCode })
        .eq("shortcode", code),
      supabase
        .from("deposit_transactions")
        .update({ shortcode: newCode })
        .eq("shortcode", code),
      supabase
        .from("youtube_subscription_months")
        .update({ shortcode: newCode })
        .eq("shortcode", code),
      supabase
        .from("youtube_subscription_members")
        .update({ id: newCode })
        .eq("id", code),
    ]);
    const { error } = await supabase
      .from("telegram_users")
      .update({ shortcode: newCode })
      .eq("shortcode", code);
    if (error) throw new Error(`Failed to update shortcode: ${error.message}`);
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
    const { error } = await supabase
      .from("telegram_users")
      .update({ telegram_user_id: newId })
      .eq("shortcode", code);
    if (error) throw new Error(`Failed to update ${field}: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("telegram_users")
      .update({ [field]: value })
      .eq("shortcode", code);
    if (error) throw new Error(`Failed to update ${field}: ${error.message}`);
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
  const { data, error } = await supabase
    .from("telegram_users")
    .select(
      "shortcode, telegram_user_id, telegram_username, first_name, last_name",
    )
    .order("shortcode", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Failed to fetch users: ${error.message}`);
  return (data ?? []) as TelegramUserRow[];
}

export async function getConfig(key: string): Promise<string> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", key)
    .single();

  if (error)
    throw new Error(`Failed to fetch config "${key}": ${error.message}`);
  return (data as { value: string }).value;
}

async function getUnpaidCountForShortcode(shortcode: string): Promise<number> {
  const { count, error } = await supabase
    .from("youtube_subscription_months")
    .select("id", { count: "exact", head: true })
    .eq("shortcode", shortcode)
    .eq("paid", false);

  if (error) throw new Error(`Failed to count months: ${error.message}`);
  return count ?? 0;
}

export async function getMemberByTelegramIdentity(
  userId: number,
): Promise<SubscriptionMember | null> {
  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("shortcode")
    .eq("telegram_user_id", userId)
    .maybeSingle();

  if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
  if (!user?.shortcode) return null;

  return getMemberByShortcode(user.shortcode);
}

export async function getMemberByUsername(
  username: string,
): Promise<SubscriptionMember | null> {
  const normalized = username.startsWith("@") ? username.slice(1) : username;

  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("shortcode")
    .ilike("telegram_username", normalized)
    .maybeSingle();

  if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
  if (!user?.shortcode) return null;

  return getMemberByShortcode(user.shortcode);
}

export async function getMemberByShortcode(
  shortcode: string,
): Promise<SubscriptionMember | null> {
  const { data, error } = await supabase
    .from("youtube_subscription_members")
    .select("id")
    .eq("id", shortcode)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch member: ${error.message}`);
  if (!data) return null;

  const unpaid_count = await getUnpaidCountForShortcode(shortcode);
  return { id: (data as { id: string }).id, unpaid_count };
}

export async function getTelegramUsernameByShortcode(
  shortcode: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_users")
    .select("telegram_username, first_name")
    .eq("shortcode", shortcode.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch telegram user: ${error.message}`);
  if (!data) return null;
  const row = data as { telegram_username?: string; first_name: string };
  return row.telegram_username ?? row.first_name;
}

export async function getYouTubeMonthsForShortcode(
  shortcode: string,
): Promise<SubscriptionMonth[]> {
  const { data, error } = await supabase
    .from("youtube_subscription_months")
    .select("id, shortcode, month, paid")
    .eq("shortcode", shortcode.toUpperCase())
    .order("month", { ascending: true });

  if (error) throw new Error(`Failed to fetch months: ${error.message}`);
  return (data ?? []) as SubscriptionMonth[];
}

export async function toggleYouTubeMonthPaid(
  shortcode: string,
  month: string, // YYYY-MM
  paid: boolean,
): Promise<SubscriptionMonth | null> {
  const normalized = shortcode.toUpperCase();
  const monthDate = `${month}-01`; // convert YYYY-MM to YYYY-MM-01 for DATE column

  const { data, error } = await supabase
    .from("youtube_subscription_months")
    .update({ paid })
    .eq("shortcode", normalized)
    .eq("month", monthDate)
    .select("id, shortcode, month, paid")
    .maybeSingle();

  if (error) throw new Error(`Failed to toggle month: ${error.message}`);
  return data as SubscriptionMonth | null;
}

export async function markYouTubePaid(shortcode: string): Promise<void> {
  const { error } = await supabase
    .from("youtube_subscription_months")
    .update({ paid: true })
    .eq("shortcode", shortcode.toUpperCase());
  if (error) throw new Error(`Failed to mark YouTube paid: ${error.message}`);
}

export async function bulkToggleYouTubeMonthsPaid(
  shortcode: string,
  months: string[], // YYYY-MM[]
  paid: boolean,
): Promise<SubscriptionMonth[]> {
  const normalized = shortcode.toUpperCase();
  const monthDates = months.map((m) => `${m}-01`);

  const { data, error } = await supabase
    .from("youtube_subscription_months")
    .update({ paid })
    .eq("shortcode", normalized)
    .in("month", monthDates)
    .select("id, shortcode, month, paid");

  if (error) throw new Error(`Failed to bulk toggle months: ${error.message}`);
  return (data ?? []) as SubscriptionMonth[];
}

export async function toggleAllYouTubeMonthsPaid(
  shortcode: string,
  paid: boolean,
): Promise<SubscriptionMonth[]> {
  const normalized = shortcode.toUpperCase();

  const { data, error } = await supabase
    .from("youtube_subscription_months")
    .update({ paid })
    .eq("shortcode", normalized)
    .eq("paid", !paid)
    .select("id, shortcode, month, paid");

  if (error) throw new Error(`Failed to toggle all months: ${error.message}`);
  return (data ?? []) as SubscriptionMonth[];
}

export async function insertCurrentMonthForAll(): Promise<void> {
  const { error } = await supabase.rpc("insert_youtube_months_current");
  if (error)
    throw new Error(`Failed to insert current month: ${error.message}`);
}

export async function getUnpaidMonthCountsAll(): Promise<SubscriptionMember[]> {
  const [{ data: allMembers }, { data: unpaidRows }] = await Promise.all([
    supabase.from("youtube_subscription_members").select("id").order("id"),
    supabase
      .from("youtube_subscription_months")
      .select("shortcode")
      .eq("paid", false),
  ]);

  const countMap = new Map<string, number>();
  for (const row of (unpaidRows ?? []) as { shortcode: string }[]) {
    countMap.set(row.shortcode, (countMap.get(row.shortcode) ?? 0) + 1);
  }

  return ((allMembers ?? []) as { id: string }[]).map((m) => ({
    id: m.id,
    unpaid_count: countMap.get(m.id) ?? 0,
  }));
}

export function buildReminderMessage(
  members: SubscriptionMember[],
  monthlyFee: number,
  depositTotals: Map<string, number> = new Map(),
): string {
  type Row = {
    id: string;
    months: number;
    total: number;
    deposit: number;
    net: number;
  };

  const rows: Row[] = [];

  for (const member of members) {
    if (member.unpaid_count === 0) continue;
    const total = member.unpaid_count * monthlyFee;
    const deposit = depositTotals.get(member.id) ?? 0;
    const net = Math.max(total - deposit, 0);
    rows.push({
      id: member.id,
      months: member.unpaid_count,
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

  const personBlocks = rows.map((r) => {
    const settled = r.net === 0 && r.deposit > 0;
    const icon = settled ? "✅" : "⏳";
    const who = `${icon} <b>${r.id}</b> — ${monthLabel(r.months)}`;

    if (settled) {
      return [`${who} — <b>Settled</b> (deposit ${money(r.deposit)})`];
    }
    if (r.deposit > 0) {
      return [
        who,
        `   ${money(r.total)} total · ${money(r.deposit)} deposit → To Pay <b>${money(r.net)}</b>`,
      ];
    }
    return [`${who} — To Pay <b>${money(r.net)}</b>`];
  });

  const personLines = personBlocks.flatMap((block, i) =>
    i < personBlocks.length - 1 ? [...block, ""] : block,
  );

  const lines = [
    `📺 YouTube payment reminder — ${money(monthlyFee)}/mo`,
    "",
    ...personLines,
  ];

  return lines.join("\n");
}

/** Telegram photo captions use HTML for reminder formatting. */
export const REMINDER_PARSE_MODE = "HTML" as const;
