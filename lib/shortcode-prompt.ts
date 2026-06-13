import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getAllDebtRecords } from "./debt";
import { getAllTelegramUsers } from "./youtube-subscription";
import { supabase } from "./supabase";

export const SHORTCODE_PICK_LABELS: Record<string, string> = {
  debts: "Who do you want to check debts for?",
  deposits: "Whose deposit history do you want to view?",
  previewowe: "Preview /owe for who?",
  paid: "Clear all debts + YouTube for who?",
  ytpaidall: "Mark all YouTube months paid for who?",
  ytunpaidall: "Mark all YouTube months unpaid for who?",
};

export function parseShortcodeFromMatch(
  match: string | undefined,
): string | null {
  const code = match?.trim().toUpperCase() ?? "";
  return code || null;
}

export async function getKnownShortcodes(): Promise<string[]> {
  const [users, debts, ytMembers] = await Promise.all([
    getAllTelegramUsers(),
    getAllDebtRecords(),
    supabase.from("youtube_subscription_members").select("id"),
  ]);

  const codes = new Set<string>();
  for (const u of users) {
    if (u.shortcode) codes.add(u.shortcode.toUpperCase());
  }
  for (const d of debts) {
    codes.add(d.shortcode.toUpperCase());
  }
  for (const row of ytMembers.data ?? []) {
    codes.add((row as { id: string }).id.toUpperCase());
  }

  return [...codes].sort();
}

export function buildShortcodePickerKeyboard(
  action: string,
  shortcodes: string[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < shortcodes.length; i++) {
    kb.text(shortcodes[i], `sc:${action}:${shortcodes[i]}`);
    if ((i + 1) % 3 === 0) kb.row();
  }
  return kb;
}

export async function promptShortcodePick(
  ctx: Pick<Context, "reply">,
  action: string,
): Promise<unknown> {
  const codes = await getKnownShortcodes();
  const label = SHORTCODE_PICK_LABELS[action] ?? "Pick a shortcode:";

  if (codes.length === 0) {
    return ctx.reply(
      `🦕 No shortcodes in the system yet.\nTry: /${action} BSR`,
    );
  }

  return ctx.reply(`🦕 ${label}`, {
    reply_markup: buildShortcodePickerKeyboard(action, codes),
  });
}

export function parseShortcodeCallbackData(
  data: string,
): { action: string; shortcode: string } | null {
  if (!data.startsWith("sc:")) return null;
  const parts = data.split(":");
  if (parts.length < 3) return null;
  return {
    action: parts[1],
    shortcode: parts.slice(2).join(":").toUpperCase(),
  };
}
