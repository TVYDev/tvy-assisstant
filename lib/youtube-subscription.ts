import { supabase } from "./supabase";

export interface SubscriptionMember {
  id: string;
  months_unpaid: number;
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

export async function getMemberByTelegramIdentity(
  userId: number,
): Promise<SubscriptionMember | null> {
  return getMemberByShortcodeFromUserId(userId);
}

async function getMemberByShortcodeFromUserId(
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
  const { data: member, error: memberError } = await supabase
    .from("youtube_subscription_members")
    .select("id, months_unpaid")
    .eq("id", shortcode)
    .maybeSingle();

  if (memberError)
    throw new Error(`Failed to fetch member: ${memberError.message}`);
  return member as SubscriptionMember | null;
}

export async function getMembers(): Promise<SubscriptionMember[]> {
  const { data, error } = await supabase
    .from("youtube_subscription_members")
    .select("id, months_unpaid")
    .order("id");

  if (error) throw new Error(`Failed to fetch members: ${error.message}`);
  return data as SubscriptionMember[];
}

export async function incrementAllMonths(): Promise<SubscriptionMember[]> {
  // Increment every member's unpaid month count by 1
  const { error: rpcError } = await supabase.rpc(
    "increment_all_youtube_months",
  );
  if (rpcError)
    throw new Error(`Failed to increment months: ${rpcError.message}`);

  return getMembers();
}

export function buildReminderMessage(
  members: SubscriptionMember[],
  monthlyFee: number,
): string {
  const lines: string[] = [`Each = $${monthlyFee.toFixed(2)}`, "====="];

  for (const member of members) {
    if (member.months_unpaid === 0) continue;
    if (member.months_unpaid === 1) {
      lines.push(`⏳ ${member.id}`);
    } else {
      const total = (member.months_unpaid * monthlyFee).toFixed(2);
      lines.push(`⏳ ${member.id} x ${member.months_unpaid} = ${total}`);
    }
  }

  return lines.join("\n");
}
