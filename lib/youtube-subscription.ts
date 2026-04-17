import { supabase } from "./supabase";

export interface SubscriptionMember {
  id: string;
  months_unpaid: number;
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
