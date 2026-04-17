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
      "👋 Hi!\nI'm Dino (aka Nailong). I'm a personal assistant to my boss, VANNYOU.\nI'll assist anything I can for him.\n\n" +
        "Available commands:\n" +
        "/owe — see if Vannyou owes you or you owe Vannyou any money\n" +
        "/qr — get KHQR code to pay Vannyou if you owe him money",
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
    caption: "Scan to pay via KHQR to Vannyou.",
  });
});

bot.command("owe", async (ctx) => {
  const username = ctx.from?.username;

  if (!username) {
    return ctx.reply(
      "Could not determine your Telegram username. Please make sure you have one set.",
    );
  }

  const userId = ctx.from!.id;

  // Keep telegram_users table up to date
  await upsertTelegramUser({
    telegram_user_id: userId,
    telegram_username: ctx.from!.username,
    first_name: ctx.from!.first_name,
    last_name: ctx.from!.last_name,
  });

  const message = await buildOweMessage(userId, username);
  if (!message) return ctx.reply("No records found for your username.");
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
    `✅ Added $${amount.toFixed(2)} debt for ${shortcode.toUpperCase()}\nReason: ${description}`,
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
  return ctx.reply(
    `✅ All debts cleared for ${shortcode} (general + YouTube subscription).`,
  );
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
    `✅ Cancelled debt item #${itemId} ($${result.amount.toFixed(2)}) for ${result.shortcode}.`,
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
    `✅ Debt item #${itemId} ($${result.amount.toFixed(2)}) marked as paid for ${result.shortcode}.`,
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
    `⏳ Debt item #${itemId} ($${result.amount.toFixed(2)}) marked as unpaid for ${result.shortcode}.`,
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
    await bot.api.sendMessage(
      YOUTUBE_GROUP_CHAT_ID,
      `🎉 BREAKING NEWS: ${mention} actually paid for YouTube (${result.month.slice(0, 7)})!! The legend!! We are NOT worthy 🙇🙇🙇`,
    );
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
    await bot.api.sendMessage(
      YOUTUBE_GROUP_CHAT_ID,
      `� Psst... ${mention}'s YouTube payment for ${result.month.slice(0, 7)} just got marked unpaid. No pressure buuuut... Dino is watching 🦕👀`,
    );
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
    lines.push("Everyone is settled up! ✨");
  } else {
    lines.push("");
    lines.push(`💰 Grand total owed: $${grandTotal.toFixed(2)}`);
  }

  return ctx.reply(lines.join("\n"));
});
