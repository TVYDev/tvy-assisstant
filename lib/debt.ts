import { supabase } from "./supabase";

export interface DebtItem {
  description: string;
  amount: number;
  date: string;
}

export interface DebtRecord {
  name: string;
  owes_me: number;
  i_owe: number;
  items: DebtItem[];
}

export async function getDebtByUsername(
  username: string,
): Promise<DebtRecord | null> {
  const normalized = username.startsWith("@") ? username.slice(1) : username;

  // Resolve shortcode from telegram_users
  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("shortcode")
    .ilike("telegram_username", normalized)
    .maybeSingle();

  if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
  if (!user?.shortcode) return null;

  const { data, error } = await supabase
    .from("debt_records")
    .select(
      "owes_me, i_owe, debt_items(description, amount, date), telegram_users(first_name, last_name)",
    )
    .eq("shortcode", user.shortcode)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch debt: ${error.message}`);
  if (!data) return null;

  const tu = data.telegram_users as {
    first_name: string;
    last_name?: string;
  } | null;
  const name = tu
    ? [tu.first_name, tu.last_name].filter(Boolean).join(" ")
    : user.shortcode;

  return {
    name,
    owes_me: Number(data.owes_me),
    i_owe: Number(data.i_owe),
    items: (data.debt_items as DebtItem[]).map((item) => ({
      description: item.description,
      amount: Number(item.amount),
      date: item.date,
    })),
  };
}
