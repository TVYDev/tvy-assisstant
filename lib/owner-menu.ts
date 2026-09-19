import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";

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
  "⏰ <b>Due reminders</b> — daily 09:00 (UTC+7)\n\n" +
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
] as const;

export function ownerMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
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
    .row()
    .text("« Main menu", "om:main");
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
