import fs from "fs";
import path from "path";
import { Bot, InputFile } from "grammy";
import {
  upsertTelegramUser,
  markYouTubePaid,
  getYouTubeMonthsForShortcode,
  toggleYouTubeMonthPaid,
  getConfig,
  getUnpaidMonthCountsAll,
  getTelegramUsernameByShortcode,
  updateTelegramUserField,
  getAllTelegramUsers,
} from "./youtube-subscription";
import { buildOweMessage } from "./owe-message";
import {
  addDebt,
  getDebtByShortcode,
  markAllPaid,
  cancelDebtItem,
  toggleDebtItemPaid,
  getAllDebtRecords,
} from "./debt";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN environment variable is not set.");

const OWNER_ID = parseInt(process.env.OWNER_TELEGRAM_ID ?? "0");

const NOT_BOSS_REPLIES = [
  "Excuse me?? 🦕 I only take orders from ONE boss, and it ain't you!",
  "Lol nice try. I have exactly one boss and you're not him. 🦖",
  "Who are you again? 🦕 My boss didn't mention anyone else.",
  "Sorry, I don't do that for strangers. Ask my actual boss. 🦖",
  "Bold of you to assume you're my boss. 🦕 Spoiler: you're not.",
  "Hmm... checking my list of bosses... nope, not you. 🦖",
  "access_denied.exe 🦕 (only Vannyou can run this command)",
];

function notBossReply(ctx: { reply: (msg: string) => unknown }) {
  const msg =
    NOT_BOSS_REPLIES[Math.floor(Math.random() * NOT_BOSS_REPLIES.length)];
  return ctx.reply(msg);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const QR_CAPTIONS = [
  "Time to pay up! 💸 Scan this KHQR to send money to Vannyou.\nDino is watching to make sure you actually do it. 🦕👀",
  "Here's your ticket to financial redemption! 🎟️ Scan and pay Vannyou before Dino comes for you. 🦕",
  "One scan away from being a good person! 😇 Do it. Pay Vannyou. 💸",
  "Scan it. Pay it. Don't make Dino chase you. 🦕💨",
  "KHQR loaded! 🔫 Aim your phone at it and shoot some money to Vannyou. 💸😂",
];

const NO_RECORD_REPLIES = [
  "Hmm, I got nothing on you 🤔 Either you're totally clean... or you just don't exist in my records yet!",
  "No records found! 👀 Either you owe nothing (nice!) or Vannyou forgot to add you 😆",
  "Clean slate! 🧼 Or maybe you're just not in the system yet. Ask Vannyou! 🦕",
  "Dino searched everywhere... nothing! 🦕 You're either debt-free or a ghost. 👻",
];

const YT_PAID_MSGS_ELDER = [
  (mention: string, month: string) =>
    `🙏 អរគុណច្រើន ${mention} បង for paying YouTube (${month})! You are the most reliable one here, as always! 🎉`,
  (mention: string, month: string) =>
    `✨ ${mention} បង came through again for ${month}! Consistent king/queen energy. We appreciate you! 🙌`,
  (mention: string, month: string) =>
    `💛 Thank you ${mention} បង! YouTube ${month} is settled — you never disappoint! 🙏`,
  (mention: string, month: string) =>
    `🌟 ${mention} បង paid for ${month}! As expected from the most dependable one in the group. អរគុណ! 🎊`,
];

const YT_PAID_MSGS = [
  (mention: string, month: string) =>
    `🚨 BREAKING NEWS: ${mention} paid for YouTube (${month})!! Is this real life?? Thank you!! 😂🎊`,
  (mention: string, month: string) =>
    `🎉 PLOT TWIST: ${mention} actually paid for ${month}!! The legend has arrived!! 🦕🙌`,
  (mention: string, month: string) =>
    `📢 ATTENTION: ${mention} just paid YouTube for ${month}! Mark this day in history! 🗓️😂`,
  (mention: string, month: string) =>
    `🏆 ${mention} paid for ${month}!! Dino would like to personally award you the "Actually Paid" trophy 🦕🏆`,
  (mention: string, month: string) =>
    `💸 Money received from ${mention} for ${month}! Vannyou is happy, Dino is happy, everyone is happy! 🥳`,
];

const YT_UNPAID_MSGS_ELDER = [
  (mention: string, month: string) =>
    `😊 Hey ${mention} បង, just a gentle heads-up — YouTube for ${month} is showing unpaid. No rush, whenever you're free! 🙏`,
  (mention: string, month: string) =>
    `🙏 ${mention} បង, Dino just wanted to let you know YouTube ${month} is still pending. Take your time! 😊`,
  (mention: string, month: string) =>
    `💛 Just a friendly nudge for ${mention} បង — ${month} YouTube hasn't been settled yet. No worries, whenever suits you! 🙏`,
];

const YT_UNPAID_MSGS = [
  (mention: string, month: string) =>
    `👀 Hey ${mention}... Dino noticed your YouTube for ${month} is unpaid 🦕 The tab is still running! 😬`,
  (mention: string, month: string) =>
    `🦕 Psst ${mention}... your YouTube tab for ${month} is still open. Dino is taking notes. 👀`,
  (mention: string, month: string) =>
    `😅 Sooo ${mention}... about that YouTube payment for ${month}... it's not gonna pay itself! 💸`,
  (mention: string, month: string) =>
    `⏰ Tick tock ${mention}! YouTube ${month} is still unpaid. Dino has a long memory. 🦕📋`,
  (mention: string, month: string) =>
    `🔔 Reminder for ${mention}: YouTube ${month} = still unpaid. Just saying. No pressure. (There's pressure.) 😂`,
];

export const bot = new Bot(token);

bot.command(
  [
    "start",
    "tvy",
    "hey_tvy",
    "hi_tvy",
    "hello_tvy",
    "dino",
    "hey_dino",
    "hi_dino",
    "hello_dino",
  ],
  async (ctx) => {
    await ctx.reply(
      "👋 Hey hey! I'm Dino 🦕 (aka Nailong)\nVannyou's loyal little assistant — doing his dirty work so he doesn't have to. 😂\n\n" +
        "Here's what I can do for you:\n" +
        "/owe — check how much you owe Vannyou (or if he owes you, lucky you 👀)\n" +
        "/qr — get the QR code to pay Vannyou 💸",
    );
    return ctx.replyWithSticker(
      "CAACAgUAAxkBAAMHadp2j926kQ_JshGZsD4LxsQ-sKsAAnEFAAK9lPBWUYQTpHJGzMM7BA",
    );
  },
);

bot.command("qr", (ctx) => {
  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");
  return ctx.replyWithPhoto(file, {
    caption: pick(QR_CAPTIONS),
  });
});

bot.command("owe", async (ctx) => {
  const username = ctx.from?.username ?? "";
  const firstName = ctx.from?.first_name ?? "friend";
  const userId = ctx.from!.id;

  // Keep telegram_users table up to date
  await upsertTelegramUser({
    telegram_user_id: userId,
    telegram_username: ctx.from!.username,
    first_name: ctx.from!.first_name,
    last_name: ctx.from!.last_name,
  });

  const message = await buildOweMessage(userId, username, firstName);
  if (!message) return ctx.reply(pick(NO_RECORD_REPLIES));
  return ctx.reply(message);
});

// Owner-only: /adddebt <shortcode> <amount> <description>
// Example: /adddebt BSR 15.50 Lunch at restaurant
bot.command("adddebt", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = ctx.match?.trim() ?? "";
  const parts = args.match(/^(\S+)\s+([\d.]+)\s+(.+)$/);

  if (!parts) {
    return ctx.reply(
      "Usage: /adddebt <shortcode> <amount> <description>\nExample: /adddebt BSR 15.50 Lunch at restaurant",
    );
  }

  const [, shortcode, amountStr, description] = parts;
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Amount must be a positive number.");
  }

  await addDebt(shortcode, amount, description);
  return ctx.reply(
    `📝 Got it boss! Added $${amount.toFixed(2)} to ${shortcode.toUpperCase()}'s tab.\nReason: ${description} 😈`,
  );
});

// Owner-only: /debts <shortcode>
bot.command("debts", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const shortcode = ctx.match?.trim().toUpperCase();
  if (!shortcode)
    return ctx.reply("Usage: /debts <shortcode>\nExample: /debts BSR");

  const [record, ytMonths, monthlyFee] = await Promise.all([
    getDebtByShortcode(shortcode),
    getYouTubeMonthsForShortcode(shortcode),
    getConfig("youtube_monthly_fee").then(parseFloat),
  ]);

  const lines: string[] = [
    `📋 Debts for ${shortcode}${record ? ` (${record.name})` : ""}`,
    "",
  ];

  if (record && record.items.length > 0) {
    const unpaidTotal = record.items
      .filter((i) => !i.paid)
      .reduce((s, i) => s + i.amount, 0);
    lines.push(`💸 General debts ($${unpaidTotal.toFixed(2)} unpaid):`);
    for (const item of record.items) {
      const status = item.paid ? "✅" : "⏳";
      lines.push(
        `  ${status} #${item.id} ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  } else {
    lines.push("💸 No general debts.");
  }

  if (ytMonths.length > 0) {
    lines.push("");
    lines.push("📺 YouTube months:");
    for (const m of ytMonths) {
      const status = m.paid ? "✅" : "⏳";
      lines.push(`  ${status} ${m.month.slice(0, 7)}`);
    }
  } else {
    lines.push("");
    lines.push("📺 No YouTube months recorded.");
  }

  const unpaidDebt = record
    ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
    : 0;
  const unpaidYt = ytMonths.filter((m) => !m.paid).length * monthlyFee;
  const total = unpaidDebt + unpaidYt;
  lines.push("");
  lines.push(`💰 Total owed: $${total.toFixed(2)}`);

  return ctx.reply(lines.join("\n"));
});

// Owner-only: /paid <shortcode> — clear all debts + YouTube subscription
bot.command("paid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const shortcode = ctx.match?.trim().toUpperCase();
  if (!shortcode)
    return ctx.reply("Usage: /paid <shortcode>\nExample: /paid BSR");

  await Promise.all([markAllPaid(shortcode), markYouTubePaid(shortcode)]);
  return ctx.reply(`🧹 All wiped! ${shortcode} is clean now — fresh start! 🎉`);
});

// Owner-only: /canceldebt <item_id> — remove a single debt item
bot.command("canceldebt", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const itemId = parseInt(ctx.match?.trim() ?? "");
  if (isNaN(itemId))
    return ctx.reply("Usage: /canceldebt <item_id>\nExample: /canceldebt 12");

  const result = await cancelDebtItem(itemId);
  if (!result) return ctx.reply(`No debt item found with ID #${itemId}.`);

  return ctx.reply(
    `🗑️ Poof! Debt #${itemId} ($${result.amount.toFixed(2)}) for ${result.shortcode} — gone! Never happened. 😅`,
  );
});

// Owner-only: /debtpaid <item_id> — mark a debt item as paid
bot.command("debtpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const itemId = parseInt(ctx.match?.trim() ?? "");
  if (isNaN(itemId))
    return ctx.reply("Usage: /debtpaid <item_id>\nExample: /debtpaid 5");
  const result = await toggleDebtItemPaid(itemId, true);
  if (!result) return ctx.reply(`No debt item found with ID #${itemId}.`);
  return ctx.reply(
    `✅ Marked #${itemId} ($${result.amount.toFixed(2)}) as paid for ${result.shortcode}. They came through! 🙌`,
  );
});

// Owner-only: /debtunpaid <item_id> — mark a debt item as unpaid
bot.command("debtunpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const itemId = parseInt(ctx.match?.trim() ?? "");
  if (isNaN(itemId))
    return ctx.reply("Usage: /debtunpaid <item_id>\nExample: /debtunpaid 5");
  const result = await toggleDebtItemPaid(itemId, false);
  if (!result) return ctx.reply(`No debt item found with ID #${itemId}.`);
  return ctx.reply(
    `⏳ Marked #${itemId} ($${result.amount.toFixed(2)}) as unpaid for ${result.shortcode}. Back on the list! 😈`,
  );
});

const YOUTUBE_GROUP_CHAT_ID = process.env.YOUTUBE_GROUP_CHAT_ID
  ? parseInt(process.env.YOUTUBE_GROUP_CHAT_ID)
  : null;

// Owner-only: /ytpaid <shortcode> <YYYY-MM> — mark a YouTube month as paid
bot.command("ytpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 2)
    return ctx.reply(
      "Usage: /ytpaid <shortcode> <YYYY-MM>\nExample: /ytpaid PVS 2026-04",
    );
  const [shortcode, month] = parts;
  const result = await toggleYouTubeMonthPaid(shortcode, month, true);
  if (!result)
    return ctx.reply(
      `No YouTube month found for ${shortcode.toUpperCase()} ${month}.`,
    );
  await ctx.reply(
    `✅ ${result.shortcode} ${result.month.slice(0, 7)} marked as paid.`,
  );
  if (YOUTUBE_GROUP_CHAT_ID) {
    const handle = await getTelegramUsernameByShortcode(result.shortcode);
    const mention = handle ? `@${handle}` : result.shortcode;
    const paidMsg = result.shortcode.startsWith("B")
      ? pick(YT_PAID_MSGS_ELDER)(mention, result.month.slice(0, 7))
      : pick(YT_PAID_MSGS)(mention, result.month.slice(0, 7));
    await bot.api.sendMessage(YOUTUBE_GROUP_CHAT_ID, paidMsg);
  }
  return;
});

// Owner-only: /ytunpaid <shortcode> <YYYY-MM> — mark a YouTube month as unpaid
bot.command("ytunpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 2)
    return ctx.reply(
      "Usage: /ytunpaid <shortcode> <YYYY-MM>\nExample: /ytunpaid PVS 2026-04",
    );
  const [shortcode, month] = parts;
  const result = await toggleYouTubeMonthPaid(shortcode, month, false);
  if (!result)
    return ctx.reply(
      `No YouTube month found for ${shortcode.toUpperCase()} ${month}.`,
    );
  await ctx.reply(
    `⏳ ${result.shortcode} ${result.month.slice(0, 7)} marked as unpaid.`,
  );
  if (YOUTUBE_GROUP_CHAT_ID) {
    const handle = await getTelegramUsernameByShortcode(result.shortcode);
    const mention = handle ? `@${handle}` : result.shortcode;
    const unpaidMsg = result.shortcode.startsWith("B")
      ? pick(YT_UNPAID_MSGS_ELDER)(mention, result.month.slice(0, 7))
      : pick(YT_UNPAID_MSGS)(mention, result.month.slice(0, 7));
    await bot.api.sendMessage(YOUTUBE_GROUP_CHAT_ID, unpaidMsg);
  }
  return;
});

// Owner-only: /allowe — summary of everyone who owes anything
bot.command("allowe", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const [debtRecords, ytMembers, monthlyFee] = await Promise.all([
    getAllDebtRecords(),
    getUnpaidMonthCountsAll(),
    getConfig("youtube_monthly_fee").then(parseFloat),
  ]);

  const debtMap = new Map(debtRecords.map((r) => [r.shortcode, r]));
  const ytMap = new Map(ytMembers.map((m) => [m.id, m.unpaid_count]));

  // Collect all shortcodes from both sources
  const allShortcodes = new Set([...debtMap.keys(), ...ytMap.keys()]);

  const lines: string[] = ["📊 Summary — everyone who owes", ""];
  let grandTotal = 0;

  for (const code of [...allShortcodes].sort()) {
    const record = debtMap.get(code);
    const ytUnpaid = ytMap.get(code) ?? 0;
    const unpaidDebt = record
      ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
      : 0;
    const ytTotal = ytUnpaid * monthlyFee;
    const total = unpaidDebt + ytTotal;

    if (total === 0) continue;
    grandTotal += total;

    const name = record?.name ?? code;
    lines.push(`👤 ${code} (${name}) — $${total.toFixed(2)} total`);
    if (unpaidDebt > 0) lines.push(`  💸 General: $${unpaidDebt.toFixed(2)}`);
    if (ytUnpaid > 0)
      lines.push(`  📺 YouTube: ${ytUnpaid} month(s) = $${ytTotal.toFixed(2)}`);
  }

  if (lines.length === 2) {
    lines.push("Everyone is settled up!! We love to see it 🦕✨");
  } else {
    lines.push("");
    lines.push(`💰 Combined damage: $${grandTotal.toFixed(2)} 😅`);
  }

  return ctx.reply(lines.join("\n"));
});

// Owner-only: /updateuser <shortcode> <field> <value>
// field: first_name | last_name | shortcode
// Example: /updateuser BSR first_name Sophia
bot.command("updateuser", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = (ctx.match?.trim() ?? "").match(
    /^(\S+)\s+(first_name|last_name|shortcode)\s+(.+)$/,
  );
  if (!args) {
    return ctx.reply(
      "Usage: /updateuser <shortcode> <field> <value>\n" +
        "Fields: first_name | last_name | shortcode\n" +
        "Example: /updateuser BSR first_name Sophia",
    );
  }

  const [, shortcode, field, value] = args as [
    string,
    string,
    "first_name" | "last_name" | "shortcode",
    string,
  ];

  await updateTelegramUserField(shortcode, field, value);

  if (field === "shortcode") {
    return ctx.reply(
      `✅ Shortcode updated: ${shortcode.toUpperCase()} → ${value.toUpperCase()}\nAll related records cascade-updated! 🔄`,
    );
  }
  return ctx.reply(
    `✅ Updated ${field} for ${shortcode.toUpperCase()} to "${value}".`,
  );
});

// Owner-only: /listusers — show all telegram_users
bot.command("listusers", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const users = await getAllTelegramUsers();
  if (users.length === 0)
    return ctx.reply("🤔 No users found in the database yet.");

  const lines = users.map((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    const username = u.telegram_username ? ` @${u.telegram_username}` : "";
    const id = u.telegram_user_id ? ` [${u.telegram_user_id}]` : " [no ID]";
    const code = u.shortcode ? `[${u.shortcode}]` : "[no shortcode]";
    return `${code} ${name}${username}${id}`;
  });

  return ctx.reply(`👥 All users (${users.length}):\n\n` + lines.join("\n"));
});

// Owner-only: /help — list all commands
bot.command("help", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return ctx.reply(
      "👋 Here's what I can do for you:\n\n" +
        "/owe — check your balance with Vannyou\n" +
        "/qr — get KHQR code to pay Vannyou",
    );
  }

  return ctx.reply(
    "📖 All commands:\n\n" +
      "👤 Public:\n" +
      "  /owe — check your balance\n" +
      "  /qr — get KHQR payment QR code\n" +
      "\n" +
      "💸 Debt management:\n" +
      "  /adddebt <shortcode> <amount> <desc>\n" +
      "    → Add debt item for someone\n" +
      "    → e.g. /adddebt BSR 15.50 Lunch\n" +
      "  /debts <shortcode>\n" +
      "    → View all debts + YouTube for someone\n" +
      "  /allowe\n" +
      "    → Summary of everyone who owes\n" +
      "  /paid <shortcode>\n" +
      "    → Clear ALL debts + YouTube for someone\n" +
      "  /canceldebt <item_id>\n" +
      "    → Remove a specific debt item\n" +
      "  /debtpaid <item_id>\n" +
      "    → Mark a debt item as paid\n" +
      "  /debtunpaid <item_id>\n" +
      "    → Mark a debt item as unpaid\n" +
      "\n" +
      "📺 YouTube subscription:\n" +
      "  /ytpaid <shortcode> <YYYY-MM>\n" +
      "    → Mark a month as paid (notifies group)\n" +
      "    → e.g. /ytpaid PVS 2026-04\n" +
      "  /ytunpaid <shortcode> <YYYY-MM>\n" +
      "    → Mark a month as unpaid (notifies group)\n" +
      "\n" +
      "👥 User management:\n" +
      "  /listusers\n" +
      "    → List all telegram users in DB\n" +
      "  /updateuser <shortcode> <field> <value>\n" +
      "    → Update first_name | last_name | shortcode\n" +
      "    → e.g. /updateuser BSR first_name Sophia\n" +
      "    → Shortcode change cascades all records",
  );
});
