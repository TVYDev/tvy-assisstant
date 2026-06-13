import fs from "fs";
import path from "path";
import { Bot, InputFile } from "grammy";
import { version } from "../package.json";
import {
  upsertTelegramUser,
  markYouTubePaid,
  getYouTubeMonthsForShortcode,
  getMemberByShortcode,
  toggleYouTubeMonthPaid,
  bulkToggleYouTubeMonthsPaid,
  toggleAllYouTubeMonthsPaid,
  getConfig,
  getUnpaidMonthCountsAll,
  getTelegramUsernameByShortcode,
  updateTelegramUserField,
  getAllTelegramUsers,
} from "./youtube-subscription";
import {
  buildOweMessage,
  calculateNetOwed,
  resolveDebtForTelegramUser,
  resolveSubscriptionMemberForTelegramUser,
} from "./owe-message";
import {
  addDebt,
  getDebtByShortcode,
  markAllPaid,
  cancelDebtItem,
  toggleDebtItemPaid,
  updateDebtItem,
  getAllDebtRecords,
} from "./debt";
import {
  addDeposit,
  reduceDeposit,
  InsufficientDepositError,
  getDepositBalanceByShortcode,
  getDepositTransactions,
  getAllDepositTotals,
  resolveDepositForTelegramUser,
} from "./deposit";
import {
  parsePaymentTail,
  settlePayment,
  formatPaymentSettlement,
  isMonthToken,
} from "./payment-settlement";

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

async function countUnpaidYouTubeMonths(
  shortcode: string,
  monthFilters?: string[],
): Promise<number> {
  const months = await getYouTubeMonthsForShortcode(shortcode);
  const unpaid = months.filter((m) => !m.paid);
  if (!monthFilters?.length) return unpaid.length;
  return unpaid.filter((m) =>
    monthFilters.some((f) => m.month.startsWith(f)),
  ).length;
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

const QR_NO_DEBT_CAPTIONS = [
  "Just browsing? 👀 No debts found — you're clean! Here's the QR anyway, just in case you feel generous. 😂",
  "Oh? You don't owe anything! 🎉 Dino approves. Here's the QR in case Vannyou's birthday is coming up. 🦕🎂",
  "No debts detected! 🧼 But hey, here's the QR code — maybe you just like scanning things. No judgment. 🦕",
  "Clean slate! ✨ You're all good with Vannyou. QR is here if you ever want to send a surprise. 💸😇",
  "Dino checked the ledger... you owe nothing! 🦕 Here's the QR anyway — feel free to tip the dino. 😂",
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
      "👋 Hey hey! I'm Dino 🦕 (aka Nailong) — the round-bellied, silly-faced dino you never knew you needed!\n" +
        "Vannyou's loyal little assistant, doing his dirty work so he doesn't have to. 😂\n" +
        "\n" +
        "Here's what I can do for you:\n" +
        "/owe — check how much you owe Vannyou (or if he owes you, lucky you 👀)\n" +
        "/qr — get the KHQR code to pay Vannyou 💸\n" +
        "/about — learn all about me, my responsibilities & current version 🦕\n" +
        "\n" +
        "What I do behind the scenes:\n" +
        "📋 Track who owes Vannyou money and remind them (gently... or not 😈)\n" +
        "📺 Monitor YouTube subscription payments every month\n" +
        '⏰ Send monthly reminders so nobody conveniently "forgets" to pay\n' +
        "🧾 Keep a detailed debt ledger so Vannyou never loses track\n" +
        "\n" +
        "I may have a round belly and a silly face, but my memory for unpaid debts is SHARP. 🦕🔪",
    );
    return ctx.replyWithSticker(
      "CAACAgUAAxkBAAMHadp2j926kQ_JshGZsD4LxsQ-sKsAAnEFAAK9lPBWUYQTpHJGzMM7BA",
    );
  },
);

bot.command("about", (ctx) => {
  return ctx.reply(
    `🦕 *About Dino (aka Nailong)* — v${version}\n` +
      "\n" +
      "Meet *Dino* — aka Nailong, the lovable dino with a round belly, silly expressions, and a big heart! 🫶\n" +
      "Originally a cheerful plush character beloved across the internet, Dino brings\n" +
      "comfort, laughter, and a joyful presence to any space.\n" +
      "\n" +
      "In this chat, Dino moonlights as Vannyou's personal assistant. 😂\n" +
      "Tiny? Yes. Round-bellied? Absolutely. Underpaid? Definitely. Reliable? ...mostly.\n" +
      "\n" +
      "*What Dino does for a living:*\n" +
      "📋 Track who owes Vannyou money (and gently shame them)\n" +
      "📺 Monitor YouTube subscription payments (so Vannyou doesn't have to)\n" +
      "💸 Show you how deep in the red you are via /owe\n" +
      "🔲 Provide the KHQR code for paying up via /qr\n" +
      '⏰ Fire monthly reminders when people "forget" to pay (shocker, they always do)\n' +
      "\n" +
      "*Fun facts about Dino:*\n" +
      "🦕 Round belly. Silly face. Zero chill about unpaid debts.\n" +
      "🤖 Powered by Node.js, Grammy, Supabase & pure Nailong energy\n" +
      "😤 Dino has exactly ONE boss and it's not you (unless you're Vannyou)\n" +
      "🫶 True purpose: bring joy — the debt chasing is just a side hustle\n" +
      "\n" +
      `🔖 Version: ${version} | Built with 🦕 by Vannyou`,
    { parse_mode: "Markdown" },
  );
});

bot.command("qr", async (ctx) => {
  const userId = ctx.from?.id ?? 0;
  const username = ctx.from?.username ?? "";
  const firstName = ctx.from?.first_name ?? "friend";

  const [record, member, monthlyFee, deposit] = await Promise.all([
    resolveDebtForTelegramUser(userId, username),
    resolveSubscriptionMemberForTelegramUser(userId, username),
    getConfig("youtube_monthly_fee").then(parseFloat),
    resolveDepositForTelegramUser(userId, username),
  ]);

  const net = calculateNetOwed({
    owes_me: record?.owes_me ?? 0,
    i_owe: record?.i_owe ?? 0,
    deposit,
    subOwed:
      member && member.unpaid_count > 0 ? member.unpaid_count * monthlyFee : 0,
  });

  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");

  if (net > 0) {
    const oweMessage = await buildOweMessage(userId, username, firstName);
    const caption = `${pick(QR_CAPTIONS)}${oweMessage ? `\n\n${oweMessage}` : ""}`;
    return ctx.replyWithPhoto(file, { caption });
  }

  return ctx.replyWithPhoto(file, { caption: pick(QR_NO_DEBT_CAPTIONS) });
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

// Owner-only: /adddeposit <shortcode> <amount>
// Example: /adddeposit BSR 20
bot.command("adddeposit", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = ctx.match?.trim() ?? "";
  const parts = args.match(/^(\S+)\s+([\d.]+)$/);

  if (!parts) {
    return ctx.reply(
      "Usage: /adddeposit <shortcode> <amount>\nExample: /adddeposit BSR 20",
    );
  }

  const [, shortcode, amountStr] = parts;
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Amount must be a positive number.");
  }

  const totalDeposit = await addDeposit(shortcode, amount);
  return ctx.reply(
    `💰 Deposit added! ${shortcode.toUpperCase()} balance is now $${totalDeposit.toFixed(2)}.`,
  );
});

// Owner-only: /reducedeposit <shortcode> <amount> [note]
// Example: /reducedeposit BSR 15 Applied to lunch debt
bot.command("reducedeposit", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = ctx.match?.trim() ?? "";
  const parts = args.match(/^(\S+)\s+([\d.]+)(?:\s+(.+))?$/);

  if (!parts) {
    return ctx.reply(
      "Usage: /reducedeposit <shortcode> <amount> [note]\nExample: /reducedeposit BSR 15 Applied to lunch debt",
    );
  }

  const [, shortcode, amountStr, note] = parts;
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Amount must be a positive number.");
  }

  try {
    const balance = await reduceDeposit(shortcode, amount, note?.trim());
    const noteLine = note?.trim() ? `\nNote: ${note.trim()}` : "";
    return ctx.reply(
      `📉 Deposit reduced by $${amount.toFixed(2)} for ${shortcode.toUpperCase()}.${noteLine}\nRemaining balance: $${balance.toFixed(2)}`,
    );
  } catch (err) {
    if (err instanceof InsufficientDepositError) {
      return ctx.reply(`❌ ${err.message}`);
    }
    throw err;
  }
});

// Owner-only: /deposits <shortcode>
bot.command("deposits", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const shortcode = ctx.match?.trim().toUpperCase();
  if (!shortcode) {
    return ctx.reply("Usage: /deposits <shortcode>\nExample: /deposits BSR");
  }

  const [balance, transactions] = await Promise.all([
    getDepositBalanceByShortcode(shortcode),
    getDepositTransactions(shortcode),
  ]);

  const lines: string[] = [
    `💰 Deposits for ${shortcode}`,
    `Current balance: $${balance.toFixed(2)}`,
    "",
  ];

  const reductions = transactions.filter((t) => t.type === "reduce");
  if (reductions.length > 0) {
    lines.push("📉 Reduction history:");
    for (const tx of reductions) {
      const date = tx.created_at.slice(0, 10);
      const note = tx.note ? ` — ${tx.note}` : "";
      lines.push(
        `  • -$${tx.amount.toFixed(2)} (${date}) → $${tx.balance_after.toFixed(2)} left${note}`,
      );
    }
    lines.push("");
  } else {
    lines.push("📉 No reductions yet.");
    lines.push("");
  }

  const additions = transactions.filter((t) => t.type === "add");
  if (additions.length > 0) {
    lines.push("📈 Add history:");
    for (const tx of additions) {
      const date = tx.created_at.slice(0, 10);
      const note = tx.note ? ` — ${tx.note}` : "";
      lines.push(
        `  • +$${tx.amount.toFixed(2)} (${date}) → $${tx.balance_after.toFixed(2)} total${note}`,
      );
    }
  } else {
    lines.push("📈 No deposits added yet.");
  }

  return ctx.reply(lines.join("\n"));
});

// Owner-only: /debts <shortcode>
bot.command("debts", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const shortcode = ctx.match?.trim().toUpperCase();
  if (!shortcode)
    return ctx.reply("Usage: /debts <shortcode>\nExample: /debts BSR");

  const [record, ytMember, monthlyFee, deposit] = await Promise.all([
    getDebtByShortcode(shortcode),
    getMemberByShortcode(shortcode),
    getConfig("youtube_monthly_fee").then(parseFloat),
    getDepositBalanceByShortcode(shortcode),
  ]);

  // Only fetch YouTube months if they're actually a subscription member
  const ytMonths = ytMember
    ? await getYouTubeMonthsForShortcode(shortcode)
    : [];

  const lines: string[] = [
    `📋 Debts for ${shortcode}${record ? ` (${record.name})` : ""}`,
    "",
  ];

  const unpaidDebtItems = record
    ? record.items.filter((i) => !i.paid)
    : [];
  if (unpaidDebtItems.length > 0) {
    const unpaidTotal = unpaidDebtItems.reduce((s, i) => s + i.amount, 0);
    lines.push(`💸 Unpaid general debts ($${unpaidTotal.toFixed(2)}):`);
    for (const item of unpaidDebtItems) {
      lines.push(
        `  ⏳ #${item.id} ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  } else {
    lines.push(
      record && record.items.length > 0
        ? "💸 No unpaid general debts."
        : "💸 No general debts.",
    );
  }

  const unpaidYtMonths = ytMonths.filter((m) => !m.paid);
  if (ytMember) {
    lines.push("");
    if (unpaidYtMonths.length > 0) {
      lines.push("📺 YouTube months (unpaid):");
      for (const m of unpaidYtMonths) {
        lines.push(`  ⏳ ${m.month.slice(0, 7)}`);
      }
    } else {
      lines.push("📺 YouTube: all paid up! ✅");
    }
  }

  const unpaidDebt = record
    ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
    : 0;
  const unpaidYt = ytMonths.filter((m) => !m.paid).length * monthlyFee;
  const grossTotal = unpaidDebt + unpaidYt;
  const netTotal = calculateNetOwed({
    owes_me: unpaidDebt,
    i_owe: 0,
    deposit,
    subOwed: unpaidYt,
  });
  lines.push("");
  if (deposit > 0) {
    lines.push(`💰 Deposit on file: $${deposit.toFixed(2)}`);
  }
  lines.push(`💰 Total owed: $${grossTotal.toFixed(2)}`);
  if (deposit > 0) {
    lines.push(`💰 Net owed (after deposit): $${netTotal.toFixed(2)}`);
  }

  return ctx.reply(lines.join("\n"));
});

// Owner-only: /paid <shortcode> — clear all debts + YouTube subscription
bot.command("paid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 1) {
    return ctx.reply(
      "Usage: /paid <shortcode> [amount|deposit]\n" +
        "  /paid BSR — clear all, deposit unchanged\n" +
        "  /paid BSR 50 — record $50 received, then clear all\n" +
        "  /paid BSR deposit — clear all using deposit only",
    );
  }

  const shortcode = parts[0].toUpperCase();
  const { tail } = parsePaymentTail(parts.slice(1));

  const [record, ytMonths, monthlyFee] = await Promise.all([
    getDebtByShortcode(shortcode),
    getYouTubeMonthsForShortcode(shortcode),
    getConfig("youtube_monthly_fee").then(parseFloat),
  ]);

  const unpaidDebt = record
    ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
    : 0;
  const unpaidYtCount = ytMonths.filter((m) => !m.paid).length;
  const paymentTotal = unpaidDebt + unpaidYtCount * monthlyFee;

  await Promise.all([markAllPaid(shortcode), markYouTubePaid(shortcode)]);

  try {
    const settlement = await settlePayment(
      shortcode,
      paymentTotal,
      tail,
      `Paid: cleared all debts and YouTube for ${shortcode}`,
    );
    return ctx.reply(
      `🧹 All wiped! ${shortcode} is clean now — fresh start! 🎉${formatPaymentSettlement(settlement.added, settlement.applied, settlement.balance)}`,
    );
  } catch (err) {
    return ctx.reply(
      `🧹 All wiped for ${shortcode}, but deposit step failed: ${(err as Error).message}`,
    );
  }
});

// Owner-only: /updatedebt <item_id> <new_amount> <new_description> — correct a debt entry
bot.command("updatedebt", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = ctx.match?.trim() ?? "";
  const parts = args.match(/^(\d+)\s+([\d.]+)\s+(.+)$/);

  if (!parts) {
    return ctx.reply(
      "Usage: /updatedebt <item_id> <new_amount> <new_description>\nExample: /updatedebt 12 20.00 Dinner at restaurant",
    );
  }

  const [, itemIdStr, amountStr, description] = parts;
  const itemId = parseInt(itemIdStr);
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Amount must be a positive number.");
  }

  const result = await updateDebtItem(itemId, amount, description);
  if (!result) return ctx.reply(`No debt item found with ID #${itemId}.`);

  return ctx.reply(
    `✏️ Updated! Debt #${itemId} for ${result.shortcode}: $${result.oldAmount.toFixed(2)} → $${result.newAmount.toFixed(2)}\nDescription: ${description}`,
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
    `🗑️ Poof! Debt #${itemId} ($${result.amount.toFixed(2)}) for ${result.shortcode} — gone! Never happened. 😅`,
  );
});

// Owner-only: /debtpaid <item_id> — mark a debt item as paid
bot.command("debtpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  const itemId = parseInt(parts[0] ?? "");
  if (isNaN(itemId)) {
    return ctx.reply(
      "Usage: /debtpaid <item_id> [amount|deposit]\n" +
        "  /debtpaid 5 — mark paid, deposit unchanged\n" +
        "  /debtpaid 5 25 — record $25 received, then settle debt\n" +
        "  /debtpaid 5 deposit — settle from deposit only",
    );
  }

  const { tail } = parsePaymentTail(parts.slice(1));
  const result = await toggleDebtItemPaid(itemId, true);
  if (!result) return ctx.reply(`No debt item found with ID #${itemId}.`);

  let settlementSuffix = "";
  if (result.newlyPaid) {
    try {
      const settlement = await settlePayment(
        result.shortcode,
        result.amount,
        tail,
        `Debt #${itemId} paid`,
      );
      settlementSuffix = formatPaymentSettlement(
        settlement.added,
        settlement.applied,
        settlement.balance,
      );
    } catch (err) {
      settlementSuffix = `\n⚠️ Marked paid, but deposit step failed: ${(err as Error).message}`;
    }
  }

  return ctx.reply(
    `✅ Marked #${itemId} ($${result.amount.toFixed(2)}) as paid for ${result.shortcode}. They came through! 🙌${settlementSuffix}`,
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

async function notifyYtGroup(
  shortcode: string,
  month: string,
  paid: boolean,
): Promise<void> {
  if (!YOUTUBE_GROUP_CHAT_ID) return;
  const handle = await getTelegramUsernameByShortcode(shortcode);
  const mention = handle ? `@${handle}` : shortcode;
  const msg = paid
    ? shortcode.startsWith("B")
      ? pick(YT_PAID_MSGS_ELDER)(mention, month)
      : pick(YT_PAID_MSGS)(mention, month)
    : shortcode.startsWith("B")
      ? pick(YT_UNPAID_MSGS_ELDER)(mention, month)
      : pick(YT_UNPAID_MSGS)(mention, month);
  await bot.api.sendMessage(YOUTUBE_GROUP_CHAT_ID, msg);
}

async function notifyYtGroupBulk(
  shortcode: string,
  months: string[],
  paid: boolean,
): Promise<void> {
  if (!YOUTUBE_GROUP_CHAT_ID || !months.length) return;
  const handle = await getTelegramUsernameByShortcode(shortcode);
  const mention = handle ? `@${handle}` : shortcode;
  const monthList = months.join(", ");
  const msg = paid
    ? shortcode.startsWith("B")
      ? pick(YT_PAID_MSGS_ELDER)(mention, monthList)
      : pick(YT_PAID_MSGS)(mention, monthList)
    : shortcode.startsWith("B")
      ? pick(YT_UNPAID_MSGS_ELDER)(mention, monthList)
      : pick(YT_UNPAID_MSGS)(mention, monthList);
  await bot.api.sendMessage(YOUTUBE_GROUP_CHAT_ID, msg);
}

// Owner-only: /ytpaid <shortcode> <YYYY-MM> [YYYY-MM ...] — mark one or more YouTube months as paid
bot.command("ytpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply(
      "Usage: /ytpaid <shortcode> <YYYY-MM> [YYYY-MM ...] [amount|deposit]\n" +
        "  /ytpaid BSR 2026-04 — mark paid, deposit unchanged\n" +
        "  /ytpaid BSR 2026-04 1.19 — record $1.19 received, then settle month\n" +
        "  /ytpaid BSR 2026-04 deposit — settle from deposit only",
    );
  }

  const [shortcode, ...rest] = parts;
  const code = shortcode.toUpperCase();
  const { leading: months, tail } = parsePaymentTail(rest);

  if (months.length === 0) {
    return ctx.reply("Provide at least one month (YYYY-MM).");
  }
  if (!months.every(isMonthToken)) {
    return ctx.reply("Month values must be YYYY-MM (e.g. 2026-04).");
  }

  const monthlyFee = await getConfig("youtube_monthly_fee").then(parseFloat);
  const unpaidCount = await countUnpaidYouTubeMonths(code, months);
  const paymentTotal = unpaidCount * monthlyFee;
  const settlementNote =
    months.length === 1
      ? `YouTube ${months[0]}`
      : `YouTube ${months.join(", ")}`;

  if (months.length === 1) {
    const result = await toggleYouTubeMonthPaid(shortcode, months[0], true);
    if (!result) {
      return ctx.reply(`No YouTube month found for ${code} ${months[0]}.`);
    }

    let settlementSuffix = "";
    try {
      const settlement = await settlePayment(
        code,
        paymentTotal,
        tail,
        settlementNote,
      );
      settlementSuffix = formatPaymentSettlement(
        settlement.added,
        settlement.applied,
        settlement.balance,
      );
    } catch (err) {
      settlementSuffix = `\n⚠️ Marked paid, but deposit step failed: ${(err as Error).message}`;
    }

    await ctx.reply(
      `✅ ${result.shortcode} ${result.month.slice(0, 7)} marked as paid.${settlementSuffix}`,
    );
    await notifyYtGroup(result.shortcode, result.month.slice(0, 7), true);
    return;
  }

  const results = await bulkToggleYouTubeMonthsPaid(shortcode, months, true);
  if (!results.length) {
    return ctx.reply(`No matching months found for ${code}.`);
  }

  let settlementSuffix = "";
  try {
    const settlement = await settlePayment(
      code,
      paymentTotal,
      tail,
      settlementNote,
    );
    settlementSuffix = formatPaymentSettlement(
      settlement.added,
      settlement.applied,
      settlement.balance,
    );
  } catch (err) {
    settlementSuffix = `\n⚠️ Marked paid, but deposit step failed: ${(err as Error).message}`;
  }

  const updated = results.map((r) => r.month.slice(0, 7)).join(", ");
  await ctx.reply(
    `✅ Marked ${results.length} month(s) as paid for ${code}:\n${updated}${settlementSuffix}`,
  );
  await notifyYtGroupBulk(
    results[0].shortcode,
    results.map((r) => r.month.slice(0, 7)),
    true,
  );
  return;
});

// Owner-only: /ytunpaid <shortcode> <YYYY-MM> [YYYY-MM ...] — mark one or more YouTube months as unpaid
bot.command("ytunpaid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 2)
    return ctx.reply(
      "Usage: /ytunpaid <shortcode> <YYYY-MM> [YYYY-MM ...]\nExample: /ytunpaid PVS 2026-04\nExample: /ytunpaid PVS 2026-01 2026-02 2026-03",
    );
  const [shortcode, ...months] = parts;

  if (months.length === 1) {
    const result = await toggleYouTubeMonthPaid(shortcode, months[0], false);
    if (!result)
      return ctx.reply(
        `No YouTube month found for ${shortcode.toUpperCase()} ${months[0]}.`,
      );
    await ctx.reply(
      `⏳ ${result.shortcode} ${result.month.slice(0, 7)} marked as unpaid.`,
    );
    await notifyYtGroup(result.shortcode, result.month.slice(0, 7), false);
    return;
  }

  // Multiple months
  const results = await bulkToggleYouTubeMonthsPaid(shortcode, months, false);
  if (!results.length)
    return ctx.reply(
      `No matching months found for ${shortcode.toUpperCase()}.`,
    );
  const updated = results.map((r) => r.month.slice(0, 7)).join(", ");
  await ctx.reply(
    `⏳ Marked ${results.length} month(s) as unpaid for ${shortcode.toUpperCase()}:\n${updated}`,
  );
  await notifyYtGroupBulk(
    results[0].shortcode,
    results.map((r) => r.month.slice(0, 7)),
    false,
  );
  return;
});

// Owner-only: /ytpaidall <shortcode> — mark ALL YouTube months as paid
bot.command("ytpaidall", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 1) {
    return ctx.reply(
      "Usage: /ytpaidall <shortcode> [amount|deposit]\n" +
        "  /ytpaidall BSR — mark all paid, deposit unchanged\n" +
        "  /ytpaidall BSR 10 — record $10 received, then settle all months\n" +
        "  /ytpaidall BSR deposit — settle all from deposit only",
    );
  }

  const shortcode = parts[0].toUpperCase();
  const { tail } = parsePaymentTail(parts.slice(1));

  const [unpaidCount, monthlyFee] = await Promise.all([
    countUnpaidYouTubeMonths(shortcode),
    getConfig("youtube_monthly_fee").then(parseFloat),
  ]);

  const results = await toggleAllYouTubeMonthsPaid(shortcode, true);
  if (!results.length) {
    return ctx.reply(`No YouTube months found for ${shortcode}.`);
  }

  let settlementSuffix = "";
  try {
    const settlement = await settlePayment(
      shortcode,
      unpaidCount * monthlyFee,
      tail,
      `YouTube all months for ${shortcode}`,
    );
    settlementSuffix = formatPaymentSettlement(
      settlement.added,
      settlement.applied,
      settlement.balance,
    );
  } catch (err) {
    settlementSuffix = `\n⚠️ Marked paid, but deposit step failed: ${(err as Error).message}`;
  }

  await ctx.reply(
    `✅ All ${results.length} month(s) for ${shortcode} marked as paid! 🎉${settlementSuffix}`,
  );
  await notifyYtGroupBulk(
    results[0].shortcode,
    results.map((r) => r.month.slice(0, 7)),
    true,
  );
  return;
});

// Owner-only: /ytunpaidall <shortcode> — mark ALL YouTube months as unpaid
bot.command("ytunpaidall", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const shortcode = ctx.match?.trim().toUpperCase();
  if (!shortcode)
    return ctx.reply(
      "Usage: /ytunpaidall <shortcode>\nExample: /ytunpaidall PVS",
    );

  const results = await toggleAllYouTubeMonthsPaid(shortcode, false);
  if (!results.length)
    return ctx.reply(`No YouTube months found for ${shortcode}.`);
  await ctx.reply(
    `⏳ All ${results.length} month(s) for ${shortcode} marked as unpaid. Back to square one! 😈`,
  );
  await notifyYtGroupBulk(
    results[0].shortcode,
    results.map((r) => r.month.slice(0, 7)),
    false,
  );
  return;
});

// Owner-only: /allowe — summary of everyone who owes anything
bot.command("allowe", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const [debtRecords, ytMembers, monthlyFee, allUsers, depositTotals] =
    await Promise.all([
      getAllDebtRecords(),
      getUnpaidMonthCountsAll(),
      getConfig("youtube_monthly_fee").then(parseFloat),
      getAllTelegramUsers(),
      getAllDepositTotals(),
    ]);

  const debtMap = new Map(debtRecords.map((r) => [r.shortcode, r]));
  const ytMap = new Map(ytMembers.map((m) => [m.id, m.unpaid_count]));
  const nameMap = new Map(
    allUsers
      .filter((u) => u.shortcode)
      .map((u) => [
        u.shortcode!,
        [u.first_name, u.last_name].filter(Boolean).join(" "),
      ]),
  );

  const allShortcodes = new Set([
    ...debtMap.keys(),
    ...ytMap.keys(),
    ...depositTotals.keys(),
  ]);

  const lines: string[] = ["📊 Summary — everyone who owes", ""];
  let grandTotal = 0;

  for (const code of [...allShortcodes].sort()) {
    const record = debtMap.get(code);
    const ytUnpaid = ytMap.get(code) ?? 0;
    const unpaidDebt = record
      ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
      : 0;
    const ytTotal = ytUnpaid * monthlyFee;
    const deposit = depositTotals.get(code) ?? 0;
    const grossTotal = unpaidDebt + ytTotal;
    const netTotal = calculateNetOwed({
      owes_me: unpaidDebt,
      i_owe: 0,
      deposit,
      subOwed: ytTotal,
    });

    if (netTotal <= 0) continue;
    grandTotal += netTotal;

    const name = record?.name ?? nameMap.get(code) ?? code;
    lines.push(`👤 ${code} (${name}) — $${netTotal.toFixed(2)} net`);
    if (unpaidDebt > 0) lines.push(`  💸 General: $${unpaidDebt.toFixed(2)}`);
    if (ytUnpaid > 0)
      lines.push(`  📺 YouTube: ${ytUnpaid} month(s) = $${ytTotal.toFixed(2)}`);
    if (deposit > 0) lines.push(`  💰 Deposit: -$${deposit.toFixed(2)}`);
    lines.push("");
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
// field: first_name | last_name | shortcode | telegram_username | telegram_user_id
// Example: /updateuser BSR first_name Sophia
bot.command("updateuser", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = (ctx.match?.trim() ?? "").match(
    /^(\S+)\s+(first_name|last_name|shortcode|telegram_username|telegram_user_id)\s+(.+)$/,
  );
  if (!args) {
    return ctx.reply(
      "Usage: /updateuser <shortcode> <field> <value>\n" +
        "Fields: first_name | last_name | shortcode | telegram_username | telegram_user_id\n" +
        "telegram_user_id: positive integer, or null/none/clear to unlink\n" +
        "Example: /updateuser BSR telegram_username johndoe\n" +
        "Example: /updateuser BSR telegram_user_id 123456789",
    );
  }

  const [, shortcode, field, value] = args as [
    string,
    string,
    | "first_name"
    | "last_name"
    | "shortcode"
    | "telegram_username"
    | "telegram_user_id",
    string,
  ];

  try {
    await updateTelegramUserField(shortcode, field, value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return ctx.reply(`❌ Update failed: ${msg}`);
  }

  const code = shortcode.toUpperCase();
  if (field === "shortcode") {
    return ctx.reply(
      `✅ Shortcode updated: ${code} → ${value.toUpperCase()}\nAll related records cascade-updated! 🔄`,
    );
  }
  if (field === "telegram_user_id") {
    const lowered = value.trim().toLowerCase();
    const cleared = ["", "null", "none", "clear"].includes(lowered);
    return ctx.reply(
      cleared
        ? `✅ Cleared telegram_user_id for ${code}.`
        : `✅ Updated telegram_user_id for ${code} to ${parseInt(value.trim(), 10)}.`,
    );
  }
  return ctx.reply(`✅ Updated ${field} for ${code} to "${value}".`);
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
      "👋 Here's what Dino can do for you:\n" +
        "\n" +
        "👤 Public commands:\n" +
        "  /owe — check your balance with Vannyou\n" +
        "  /qr — get KHQR code to pay Vannyou\n" +
        "  /about — learn about Dino (aka Nailong) & current version\n" +
        "  /help — show this help message",
    );
  }

  return ctx.reply(
    "📖 All commands:\n" +
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
      "    → Shortcode change cascades all records",
  );
});
