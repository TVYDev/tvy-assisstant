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
  field: "first_name" | "last_name" | "shortcode",
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

async function getMemberByShortcode(
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
    .select("id, shortcode, month, paid");

  if (error)
    throw new Error(`Failed to toggle all months: ${error.message}`);
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
): string {
  const lines: string[] = [`Each = $${monthlyFee.toFixed(2)}`, "====="];

  for (const member of members) {
    if (member.unpaid_count === 0) continue;
    if (member.unpaid_count === 1) {
      lines.push(`⏳ ${member.id}`);
    } else {
      const total = (member.unpaid_count * monthlyFee).toFixed(2);
      lines.push(`⏳ ${member.id} x ${member.unpaid_count} = ${total}`);
    }
  }

  return lines.join("\n");
}
