import { supabase } from "./supabase";

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

export async function addDebt(
  shortcode: string,
  amount: number,
  description: string,
): Promise<void> {
  const code = shortcode.toUpperCase();
  const today = new Date().toISOString().split("T")[0];

  // Ensure a telegram_users stub exists so the FK on debt_records is satisfied
  await supabase
    .from("telegram_users")
    .upsert(
      { shortcode: code, first_name: code },
      { onConflict: "shortcode", ignoreDuplicates: true },
    );

  // Upsert debt_record (create if not exists)
  await supabase
    .from("debt_records")
    .upsert(
      { shortcode: code, owes_me: 0, i_owe: 0 },
      { onConflict: "shortcode", ignoreDuplicates: true },
    );

  // Get the record id
  const { data: rec, error: recError } = await supabase
    .from("debt_records")
    .select("id")
    .eq("shortcode", code)
    .single();
  if (recError)
    throw new Error(`Failed to get debt record: ${recError.message}`);

  // Insert debt item
  const { error: itemError } = await supabase.from("debt_items").insert({
    debt_record_id: (rec as { id: number }).id,
    description,
    amount,
    date: today,
  });
  if (itemError)
    throw new Error(`Failed to insert debt item: ${itemError.message}`);

  // Increment owes_me
  const { error: updateError } = await supabase.rpc("increment_owes_me", {
    p_shortcode: code,
    p_amount: amount,
  });
  if (updateError)
    throw new Error(`Failed to update owes_me: ${updateError.message}`);
}

export async function toggleDebtItemPaid(
  itemId: number,
  paid: boolean,
): Promise<{ shortcode: string; amount: number } | null> {
  const { data: item, error: fetchError } = await supabase
    .from("debt_items")
    .select("id, amount, paid, debt_record_id")
    .eq("id", itemId)
    .maybeSingle();
  if (fetchError)
    throw new Error(`Failed to fetch item: ${fetchError.message}`);
  if (!item) return null;

  const { error: updateError } = await supabase
    .from("debt_items")
    .update({ paid })
    .eq("id", itemId);
  if (updateError)
    throw new Error(`Failed to update item: ${updateError.message}`);

  const { data: rec, error: recError } = await supabase
    .from("debt_records")
    .select("shortcode")
    .eq("id", (item as { debt_record_id: number }).debt_record_id)
    .single();
  if (recError) throw new Error(`Failed to fetch record: ${recError.message}`);

  const shortcode = (rec as { shortcode: string }).shortcode;
  const amount = Number((item as { amount: number }).amount);

  // Update owes_me: if marking paid, decrement; if unpaid, increment
  if (paid) {
    await supabase.rpc("decrement_owes_me", {
      p_shortcode: shortcode,
      p_amount: amount,
    });
  } else {
    await supabase.rpc("increment_owes_me", {
      p_shortcode: shortcode,
      p_amount: amount,
    });
  }

  return { shortcode, amount };
}

export async function getDebtByShortcode(
  shortcode: string,
): Promise<DebtRecord | null> {
  const code = shortcode.toUpperCase();

  const { data, error } = await supabase
    .from("debt_records")
    .select(
      "owes_me, i_owe, debt_items(id, description, amount, date, paid), telegram_users(first_name, last_name)",
    )
    .eq("shortcode", code)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch debt: ${error.message}`);
  if (!data) return null;

  const tu = data.telegram_users as {
    first_name: string;
    last_name?: string;
  } | null;
  const name = tu
    ? [tu.first_name, tu.last_name].filter(Boolean).join(" ")
    : code;

  return {
    shortcode: code,
    name,
    owes_me: Number(data.owes_me),
    i_owe: Number(data.i_owe),
    items: (data.debt_items as DebtItem[]).map((item) => ({
      id: item.id,
      description: item.description,
      amount: Number(item.amount),
      date: item.date,
      paid: Boolean(item.paid),
    })),
  };
}

export async function markAllPaid(shortcode: string): Promise<void> {
  const code = shortcode.toUpperCase();

  const { data: rec, error: recError } = await supabase
    .from("debt_records")
    .select("id")
    .eq("shortcode", code)
    .maybeSingle();
  if (recError) throw new Error(`Failed to find record: ${recError.message}`);
  if (!rec) throw new Error(`No debt record for ${code}`);

  const id = (rec as { id: number }).id;

  await supabase.from("debt_items").delete().eq("debt_record_id", id);
  await supabase
    .from("debt_records")
    .update({ owes_me: 0, i_owe: 0 })
    .eq("shortcode", code);
}

export async function cancelDebtItem(
  itemId: number,
): Promise<{ shortcode: string; amount: number } | null> {
  const { data: item, error: fetchError } = await supabase
    .from("debt_items")
    .select("id, amount, debt_record_id")
    .eq("id", itemId)
    .maybeSingle();
  if (fetchError)
    throw new Error(`Failed to fetch item: ${fetchError.message}`);
  if (!item) return null;

  const { data: rec, error: recError } = await supabase
    .from("debt_records")
    .select("shortcode")
    .eq("id", (item as { debt_record_id: number }).debt_record_id)
    .single();
  if (recError) throw new Error(`Failed to fetch record: ${recError.message}`);

  const shortcode = (rec as { shortcode: string }).shortcode;
  const amount = Number((item as { amount: number }).amount);

  await supabase.from("debt_items").delete().eq("id", itemId);
  await supabase.rpc("decrement_owes_me", {
    p_shortcode: shortcode,
    p_amount: amount,
  });

  return { shortcode, amount };
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
      "owes_me, i_owe, debt_items(id, description, amount, date, paid), telegram_users(first_name, last_name)",
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
    shortcode: user.shortcode,
    name,
    owes_me: Number(data.owes_me),
    i_owe: Number(data.i_owe),
    items: (data.debt_items as DebtItem[]).map((item) => ({
      id: item.id,
      description: item.description,
      amount: Number(item.amount),
      date: item.date,
      paid: Boolean(item.paid),
    })),
  };
}

export async function getDebtByUserId(
  userId: number,
): Promise<DebtRecord | null> {
  const { data: user, error: userError } = await supabase
    .from("telegram_users")
    .select("shortcode")
    .eq("telegram_user_id", userId)
    .maybeSingle();

  if (userError) throw new Error(`Failed to fetch user: ${userError.message}`);
  if (!user?.shortcode) return null;

  return getDebtByShortcode(user.shortcode);
}

export async function getAllDebtRecords(): Promise<DebtRecord[]> {
  const { data, error } = await supabase
    .from("debt_records")
    .select(
      "shortcode, owes_me, i_owe, debt_items(id, description, amount, date, paid), telegram_users(first_name, last_name)",
    )
    .order("shortcode");

  if (error) throw new Error(`Failed to fetch all debts: ${error.message}`);

  return (
    (data ?? []) as Array<{
      shortcode: string;
      owes_me: number;
      i_owe: number;
      debt_items: DebtItem[];
      telegram_users: { first_name: string; last_name?: string } | null;
    }>
  ).map((row) => {
    const tu = row.telegram_users;
    const name = tu
      ? [tu.first_name, tu.last_name].filter(Boolean).join(" ")
      : row.shortcode;
    return {
      shortcode: row.shortcode,
      name,
      owes_me: Number(row.owes_me),
      i_owe: Number(row.i_owe),
      items: row.debt_items.map((item) => ({
        id: item.id,
        description: item.description,
        amount: Number(item.amount),
        date: item.date,
        paid: Boolean(item.paid),
      })),
    };
  });
}
