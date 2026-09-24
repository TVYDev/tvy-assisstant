import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import { getMiniAppUrl } from "./mini-app/url";

export const OWNER_MENU_MAIN_TEXT =
  "🦕 <b>Admin menu</b> — boss only\n\nTap a section, or use the quick-action buttons.";

export const OWNER_MENU_DEBT_TEXT =
  "💸 <b>Debts</b>\n\n" +
  "<code>/debts BSR</code> — view unpaid + YouTube\n" +
  "<code>/adddebt BSR 15 Lunch</code> — add item\n" +
  "<code>/paid BSR</code> — clear all debts + YouTube\n" +
  "<code>/paid BSR deposit</code> — settle from deposit\n" +
  "<code>/debtpaid 5 deposit</code> — mark one item paid\n" +
  "<code>/updatedebt 12 20 Dinner</code> — fix item\n" +
  "<code>/canceldebt 12</code> — remove item";

export const OWNER_MENU_DEPOSIT_TEXT =
  "💰 <b>Deposits</b>\n\n" +
  "<code>/adddeposit BSR 20</code> — add credit\n" +
  "<code>/reducedeposit BSR 10 note</code> — reduce + log\n" +
  "<code>/deposits BSR</code> — balance + history";

export const OWNER_MENU_YT_TEXT =
  "📺 <b>YouTube</b>\n\n" +
  "<code>/ytpaid BSR 2026-06</code> — mark month paid\n" +
  "<code>/ytpaid BSR 2026-06 deposit</code> — pay from deposit\n" +
  "<code>/ytpaidall BSR deposit</code> — mark all paid\n" +
  "<code>/ytunpaid BSR 2026-06</code> — mark unpaid\n" +
  "<code>/addytfee 1.49 2026-07-01</code> — new rate";

export const OWNER_MENU_USER_TEXT =
  "👥 <b>Users</b>\n\n" +
  "<code>/listusers</code> — everyone in DB\n" +
  "<code>/updateuser BSR telegram_username johndoe</code>\n" +
  "<code>/updateuser BSR telegram_user_id 123456789</code>\n" +
  "<code>/updateuser BSR first_name Sophia</code>";

export const OWNER_MENU_PREVIEW_TEXT =
  "🔍 <b>Previews</b>\n\n" +
  "<code>/previewowe BSR</code> — preview someone's /owe\n" +
  "<code>/stickerid</code> — sticker file_id (owner DM only)\n" +
  "Use the button below for the monthly YouTube reminder preview.";

export const OWNER_MENU_STICKERS_TEXT =
  "🎭 <b>Follow-up stickers</b>\n\n" +
  "Configure stickers sent after public commands.\n" +
  "Use the buttons below, or open <b>Stickers</b> from the main menu.";

export const OWNER_MENU_FIT_TEXT =
  "🏋️ <b>Fitness logging</b>\n\n" +
  "<code>/fit</code> — guided log for today\n" +
  "<code>/fit YYYY-MM-DD</code> — guided backdate\n" +
  "<code>/fit 75.5 rest</code> — quick rest day\n" +
  "<code>/fit 75.5 skip</code> — quick skip\n" +
  "<code>/fit 75.5 yes chest 45</code> — quick gym log\n" +
  "<code>/fithistory [weeks]</code> — 12-week grid + last 7 days of logs\n" +
  "<code>/gymreminder on|off</code> — weekday 4:45 PM nudge\n" +
  "<code>/cancelfit</code> — cancel in-progress session";

export const OWNER_MENU_TODOS_TEXT =
  "📋 <b>Todos & reminders</b>\n\n" +
  "Tap <b>Add todo</b> or <b>Add reminder</b> for the button wizard.\n" +
  "<code>/addtodo Buy milk</code> — inbox\n" +
  "<code>/addtodo #shopping Buy milk @ tomorrow 09:00</code>\n" +
  "<code>/todos today</code> — due today + overdue\n" +
  "<code>/todos all</code> — open and done\n" +
  "<code>/todosearch milk</code> — title contains\n" +
  "<code>/remind tomorrow 15:00 Call dentist</code>\n" +
  "<code>/canceltask</code> — cancel the add wizard";

export const OWNER_MENU_CRONS_TEXT =
  "⏰ <b>Scheduled crons</b>\n\n" +
  "Tap to run the same job as Vercel cron (posts for real).\n\n" +
  "📺 <b>YouTube reminder</b> — 1st of month, 08:00 (UTC+7)\n" +
  "🌅 <b>Fitness reminder</b> — daily 07:50 (UTC+7)\n" +
  "💪 <b>Gym motivation</b> — weekdays 16:45 (UTC+7)\n" +
  "⏰ <b>Due reminders</b> — daily 09:00 (UTC+7)\n" +
  "📖 <b>Word of the day</b> — daily 06:00 (UTC+7)\n" +
  "🎲 <b>Random word</b> — daily 08:19 (UTC+7), owner only until you add recipients\n\n" +
  "Fitness and gym runs from here bypass skip checks (weekend / already logged / off).";

export const OWNER_MENU_HELP_TEXT =
  "📖 <b>Quick tip</b>\n\n" +
  "Type <code>/help</code> for the full command list.\n" +
  "Type <code>/menu</code> anytime to reopen this panel.\n" +
  "Use <b>Stickers</b> in the menu to configure follow-up stickers.\n" +
  "Use <b>Fit</b> for daily logging shortcuts.\n" +
  "Use <b>Todos</b> to add lists, todos, and reminders.\n" +
  "Use <b>Crons</b> to manually re-run scheduled jobs.\n\n" +
  "Public users only see: /owe /qr /about /help";

export const TELEGRAM_MESSAGE_CHAR_LIMIT = 4096;

export const PUBLIC_HELP_TEXT =
  "👋 Here's what Dino can do for you:\n" +
  "\n" +
  "👤 Public commands:\n" +
  "  /owe — check your balance with Vannyou\n" +
  "  /qr — get KHQR code to pay Vannyou\n" +
  "  /about — learn about Dino (aka Nailong) & current version\n" +
  "  /help — show this help message";

export const OWNER_HELP_TEXT =
  "📖 All commands:\n" +
  "\n" +
  "🦕 Tip: type /menu for the button panel\n" +
  "\n" +
  "👤 Public:\n" +
  "  /owe — check your balance\n" +
  "  /qr — get KHQR payment QR code\n" +
  "  /about — about Dino (aka Nailong) & version\n" +
  "  /help — show this help message\n" +
  "\n" +
  "💸 Debt management:\n" +
  "  /adddebt <shortcode> <amount> <desc>\n" +
  "    → Add a debt item for someone\n" +
  "    → e.g. /adddebt BSR 15.50 Lunch\n" +
  "  /adddeposit <shortcode> <amount>\n" +
  "    → Add to someone's deposit balance\n" +
  "    → e.g. /adddeposit BSR 20\n" +
  "  /reducedeposit <shortcode> <amount> [note]\n" +
  "    → Reduce deposit balance (logged in history)\n" +
  "    → e.g. /reducedeposit BSR 15 Applied to lunch\n" +
  "  /deposits <shortcode>\n" +
  "    → View current balance + add/reduce history\n" +
  "    → e.g. /deposits BSR\n" +
  "  /updatedebt <item_id> <amount> <desc>\n" +
  "    → Correct an existing debt item\n" +
  "    → e.g. /updatedebt 12 20.00 Dinner\n" +
  "  /debts <shortcode>\n" +
  "    → View unpaid debts + YouTube for someone\n" +
  "  /allowe\n" +
  "    → Summary of everyone who owes\n" +
  "  /paid <shortcode> [amount|deposit]\n" +
  "    → Clear ALL debts + YouTube\n" +
  "    → no extra args: deposit unchanged\n" +
  "    → amount: record cash received, then settle\n" +
  "    → deposit: settle from deposit only\n" +
  "  /canceldebt <item_id>\n" +
  "    → Remove a specific debt item\n" +
  "  /debtpaid <item_id> [amount|deposit]\n" +
  "    → Mark debt paid; optional amount or deposit\n" +
  "    → e.g. /debtpaid 5 25 or /debtpaid 5 deposit\n" +
  "  /debtunpaid <item_id>\n" +
  "    → Mark a debt item as unpaid\n" +
  "\n" +
  "📺 YouTube subscription:\n" +
  "  /ytpaid <shortcode> <YYYY-MM> [...] [amount|deposit]\n" +
  "    → Mark month(s) paid; optional amount or deposit\n" +
  "    → e.g. /ytpaid BSR 2026-04 1.19\n" +
  "    → e.g. /ytpaid BSR 2026-04 deposit\n" +
  "  /ytunpaid <shortcode> <YYYY-MM> [YYYY-MM ...]\n" +
  "    → Mark one or more months as unpaid (1 group notification)\n" +
  "  /ytpaidall <shortcode> [amount|deposit]\n" +
  "    → Mark ALL months paid; optional amount or deposit\n" +
  "  /ytunpaidall <shortcode>\n" +
  "    → Mark ALL months as unpaid (1 group notification)\n" +
  "  /ytfees\n" +
  "    → List YouTube fee schedules (effective / expiry dates)\n" +
  "  /addytfee <amount> <from YYYY-MM-DD> [to YYYY-MM-DD]\n" +
  "    → Add a fee period by date; auto-closes prior open-ended schedule\n" +
  "  /previewytreminder\n" +
  "    → Preview monthly YouTube reminder (QR + list) in this chat\n" +
  "  /previewowe <shortcode>\n" +
  "    → Preview /owe message for a user by shortcode\n" +
  "  /stickerid\n" +
  "    → Sticker file_id lookup (owner DM only)\n" +
  "  /menu\n" +
  "    → Admin button menu (owner only)\n" +
  "    → Stickers section configures follow-ups for /start, /owe, /qr, /about\n" +
  "\n" +
  "👥 User management:\n" +
  "  /listusers\n" +
  "    → List all telegram users in DB\n" +
  "  /updateuser <shortcode> <field> <value>\n" +
  "    → first_name | last_name | shortcode | telegram_username | telegram_user_id\n" +
  "    → telegram_user_id: numeric Telegram id, or null/none/clear to unlink\n" +
  "    → e.g. /updateuser BSR first_name Sophia\n" +
  "    → e.g. /updateuser BSR telegram_username johndoe\n" +
  "    → e.g. /updateuser BSR telegram_user_id 123456789\n" +
  "    → Shortcode change cascades all records\n" +
  "\n" +
  "🏋️ Fitness logging:\n" +
  "  /fit\n" +
  "    → Guided morning log for today\n" +
  "  /fit YYYY-MM-DD\n" +
  "    → Guided backdate for a missed morning\n" +
  "  /fit <weight> rest\n" +
  "    → Quick rest-day log, e.g. /fit 75.5 rest\n" +
  "  /fit <weight> skip\n" +
  "    → Quick skip log, e.g. /fit 75.5 skip\n" +
  "  /fit <weight> yes <session> <minutes>\n" +
  "    → Quick gym log, e.g. /fit 75.5 yes chest 45\n" +
  "  /fit YYYY-MM-DD <weight> ...\n" +
  "    → Quick backdate, e.g. /fit 2026-06-12 75.5 rest\n" +
  "  /cancelfit\n" +
  "    → Cancel an in-progress log session\n" +
  "  /fithistory [weeks]\n" +
  "    → Gym dot grid (default 12 weeks) + recent logs (last 7 days)\n" +
  "  /gymreminder [on|off]\n" +
  "    → Weekday 4:45 PM gym motivation DM (default on)\n" +
  "\n" +
  "📋 Todos & reminders:\n" +
  "  /addtodo\n" +
  "    → Button wizard to add a todo\n" +
  "  /addtodo Buy milk\n" +
  "    → Add to inbox\n" +
  "  /addtodo #shopping Buy milk @ tomorrow 09:00\n" +
  "    → Add to a list with a due reminder\n" +
  "  /todos\n" +
  "    → Open todos, grouped by list\n" +
  "  /todos all\n" +
  "    → Open and done, grouped by list\n" +
  "  /todos today\n" +
  "    → Due today + overdue (done today at the bottom)\n" +
  "  /todos shopping\n" +
  "    → Open items in one list\n" +
  "  /todosearch milk\n" +
  "    → Find todos whose title contains a word (open and done)\n" +
  "  /addlist shopping\n" +
  "    → Create a list\n" +
  "  /todolists\n" +
  "    → List names + open counts\n" +
  "  /tododone <id> /todoundone <id> /canceltodo <id>\n" +
  "  /todomove <id> shopping\n" +
  "  /remind\n" +
  "    → Button wizard to add a reminder\n" +
  "  /remind tomorrow 15:00 Call dentist\n" +
  "  /remind 08:00 Gym daily\n" +
  "  /reminders\n" +
  "  /cancelremind <id>\n" +
  "  /canceltask\n" +
  "    → Cancel the add wizard";

export function splitTelegramText(
  text: string,
  limit = TELEGRAM_MESSAGE_CHAR_LIMIT,
): string[] {
  const source = text.trimEnd();
  if (source.length <= limit) return [source];

  const chunks: string[] = [];
  let remaining = source;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let cut = window.lastIndexOf("\n\n");
    if (cut < Math.floor(limit / 3)) {
      cut = window.lastIndexOf("\n");
    }
    if (cut < Math.floor(limit / 3)) {
      cut = limit;
    }
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).replace(/^\n+/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

const PUBLIC_COMMANDS = [
  { command: "owe", description: "Check your balance with Vannyou" },
  { command: "qr", description: "Get KHQR code to pay Vannyou" },
  { command: "about", description: "About Dino & version" },
  { command: "help", description: "Help" },
] as const;

const OWNER_COMMANDS = [
  { command: "menu", description: "Admin button menu (owner only)" },
  { command: "help", description: "Full admin command list" },
  { command: "debts", description: "View debts by shortcode" },
  { command: "adddebt", description: "Add a debt item" },
  { command: "paid", description: "Clear all debts + YouTube" },
  { command: "adddeposit", description: "Add deposit credit" },
  { command: "deposits", description: "View deposit history" },
  { command: "allowe", description: "Summary of everyone who owes" },
  { command: "ytpaid", description: "Mark YouTube month(s) paid" },
  { command: "ytfees", description: "List YouTube fee schedules" },
  { command: "previewowe", description: "Preview /owe for a shortcode" },
  { command: "stickerid", description: "Get Telegram sticker file_id" },
  { command: "fit", description: "Log daily weight and gym session" },
  { command: "fithistory", description: "View fitness log history" },
  { command: "gymreminder", description: "Toggle gym motivation reminder" },
  { command: "cancelfit", description: "Cancel in-progress fitness log" },
  { command: "todos", description: "List todos (today / all / list name)" },
  { command: "todosearch", description: "Search todos by word" },
  { command: "addtodo", description: "Add a todo or start the wizard" },
  { command: "remind", description: "Add a reminder or start the wizard" },
  { command: "reminders", description: "List upcoming reminders" },
  { command: "canceltask", description: "Cancel the add-todo/reminder wizard" },
  { command: "previewytreminder", description: "Preview monthly YT reminder" },
  { command: "listusers", description: "List all telegram users" },
  { command: "wordgroup", description: "Add or remove a word-lesson chat" },
] as const;

export function ownerMainMenuKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("💸 Debts", "om:debt")
    .text("💰 Deposits", "om:dep")
    .row()
    .text("📺 YouTube", "om:yt")
    .text("👥 Users", "om:user")
    .row()
    .text("🔍 Previews", "om:prev")
    .text("🎭 Stickers", "om:stickers")
    .row()
    .text("🏋️ Fit", "om:fit")
    .text("📋 Todos", "om:todo")
    .row()
    .text("⏰ Crons", "om:cron")
    .text("📖 Help", "om:help");

  const miniAppUrl = getMiniAppUrl();
  if (miniAppUrl) {
    keyboard.row().webApp("📱 Mini App", miniAppUrl);
  }
  return keyboard;
}

export function ownerDebtMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 All owe", "om:run:allowe")
    .text("📋 Pick shortcode", "om:pick:debts")
    .row()
    .text("« Main menu", "om:main");
}

export function ownerDepositMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("« Main menu", "om:main");
}

export function ownerYtMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📺 Fee schedules", "om:run:ytfees")
    .text("🔔 YT reminder", "om:run:previewytreminder")
    .row()
    .text("« Main menu", "om:main");
}

export function ownerUserMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 List users", "om:run:listusers")
    .row()
    .text("« Main menu", "om:main");
}

export function ownerPreviewMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔔 YT reminder", "om:run:previewytreminder")
    .row()
    .text("« Main menu", "om:main");
}

export function ownerFitMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Log today", "om:run:fit")
    .text("📊 History", "om:run:fithistory")
    .row()
    .text("🔔 Reminder status", "om:run:gymreminder")
    .text("❌ Cancel session", "om:run:cancelfit")
    .row()
    .text("✅ Reminder ON", "om:run:gymreminder:on")
    .text("🔕 Reminder OFF", "om:run:gymreminder:off")
    .row()
    .text("« Main menu", "om:main");
}

export function ownerTodosMenuKeyboard(
  lists: Array<{ slug: string; title: string }> = [],
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("➕ Add todo", "om:run:todo")
    .text("⏰ Add reminder", "om:run:remind")
    .row()
    .text("📅 Today", "om:run:todos:today")
    .text("📋 Open", "om:run:todos")
    .row()
    .text("📚 All + done", "om:run:todos:all")
    .text("⏰ Reminders", "om:run:reminders")
    .row()
    .text("❌ Cancel wizard", "om:run:canceltask")
    .row();

  for (let i = 0; i < lists.length; i += 2) {
    keyboard.text(`#${lists[i].slug}`, `om:run:todos:list:${lists[i].slug}`);
    if (lists[i + 1]) {
      keyboard.text(
        `#${lists[i + 1].slug}`,
        `om:run:todos:list:${lists[i + 1].slug}`,
      );
    }
    keyboard.row();
  }

  return keyboard.text("« Main menu", "om:main");
}

export function ownerCronsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📺 YouTube reminder", "om:run:cron:youtube")
    .row()
    .text("🌅 Fitness reminder", "om:run:cron:fitness")
    .text("💪 Gym motivation", "om:run:cron:gym")
    .row()
    .text("⏰ Due reminders", "om:run:cron:reminders")
    .text("📖 Word of the day", "om:run:cron:word")
    .text("🎲 Random word", "om:run:cron:random-word")
    .row()
    .text("👥 Word recipients", "om:wordto")
    .row()
    .text("« Main menu", "om:main");
}

export function ownerWordRecipientsKeyboard(input: {
  users: Array<{ id: number; label: string; selected: boolean }>;
  groupIds: string[];
}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const user of input.users) {
    keyboard
      .text(`${user.selected ? "✅" : "➕"} ${user.label}`, `om:wordto:u:${user.id}`)
      .row();
  }
  for (const groupId of input.groupIds) {
    keyboard.text(`✕ ${groupId}`, `om:wordto:g:${groupId}`).row();
  }
  return keyboard.text("« Crons", "om:cron");
}

export function ownerBackMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("« Main menu", "om:main");
}

export async function registerBotCommands(
  api: Api,
  ownerId: number,
): Promise<void> {
  await api.setMyCommands([...PUBLIC_COMMANDS]);

  if (ownerId > 0) {
    await api.setMyCommands([...OWNER_COMMANDS], {
      scope: { type: "chat", chat_id: ownerId },
    });
  }
}
