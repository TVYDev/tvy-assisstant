import fs from "fs";
import path from "path";
import { Bot, InputFile } from "grammy";
import { version } from "../package.json";
import {
  upsertTelegramUser,
  markYouTubePaid,
  getYouTubeMonthsForShortcode,
  toggleYouTubeMonthPaid,
  bulkToggleYouTubeMonthsPaid,
  toggleAllYouTubeMonthsPaid,
  getTelegramUsernameByShortcode,
  updateTelegramUserField,
} from "./youtube-subscription";
import {
  buildOweMessage,
  resolveDebtForTelegramUser,
  resolveNetOwedForTelegramUser,
  resolveSubscriptionMemberForTelegramUser,
} from "./owe-message";
import {
  addDebt,
  getDebtByShortcode,
  markAllPaid,
  cancelDebtItem,
  toggleDebtItemPaid,
  updateDebtItem,
} from "./debt";
import {
  startSession,
  getSession,
  cancelSession,
  advanceSession,
  submitQuickLog,
  splitFitCommandArgs,
  getLogHistory,
  formatLogHistory,
  isGymMotivationReminderEnabled,
  setGymMotivationReminderEnabled,
  formatGymMotivationReminderStatus,
  parseFitnessLogCallback,
  FITNESS_LOG_CALLBACK_PREFIX,
  type AdvanceSessionResult,
  type FitnessLogKeyboard,
} from "./fitness-log";
import {
  addDeposit,
  reduceDeposit,
  InsufficientDepositError,
  resolveDepositForTelegramUser,
} from "./deposit";
import {
  getUnpaidYoutubeOwing,
  addYoutubeFeeSchedule,
  formatFeeScheduleLine,
  isDateToken,
} from "./youtube-fee";
import {
  parsePaymentTail,
  settlePayment,
  formatPaymentSettlement,
  isMonthToken,
} from "./payment-settlement";
import {
  buildAlloweSummary,
  buildListUsersReply,
  buildYtFeesReply,
  sendYtReminderPreview,
  buildDebtsReply,
  buildDepositsReply,
  buildPreviewOweReply,
} from "./owner-replies";
import {
  registerBotCommands,
  ownerMainMenuKeyboard,
  ownerDebtMenuKeyboard,
  ownerDepositMenuKeyboard,
  ownerYtMenuKeyboard,
  ownerUserMenuKeyboard,
  ownerPreviewMenuKeyboard,
  ownerBackMenuKeyboard,
  OWNER_MENU_MAIN_TEXT,
  OWNER_MENU_DEBT_TEXT,
  OWNER_MENU_DEPOSIT_TEXT,
  OWNER_MENU_YT_TEXT,
  OWNER_MENU_USER_TEXT,
  OWNER_MENU_PREVIEW_TEXT,
  OWNER_MENU_HELP_TEXT,
} from "./owner-menu";
import {
  parseShortcodeFromMatch,
  promptShortcodePick,
  parseShortcodeCallbackData,
} from "./shortcode-prompt";
import {
  assignStickerToCommand,
  buildCommandStickerDetailText,
  buildCommandStickersOverviewText,
  clearStickerSetupPending,
  getCommandFollowupStickerConfig,
  getStickerSetupPending,
  maybeSendCommandFollowupSticker,
  ownerStickerCommandKeyboard,
  ownerStickersMenuKeyboard,
  parseConfigurableCommandKey,
  setStickerSetupPending,
  updateCommandFollowupStickerRule,
  type ConfigurableCommandKey,
} from "./command-followup-stickers";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN environment variable is not set.");

async function refreshStickerCommandPanel(
  ctx: {
    editMessageText: (
      text: string,
      options?: {
        parse_mode?: "HTML";
        reply_markup?: ReturnType<typeof ownerStickerCommandKeyboard>;
      },
    ) => Promise<unknown>;
    reply: (
      text: string,
      options?: {
        parse_mode?: "HTML";
        reply_markup?: ReturnType<typeof ownerStickerCommandKeyboard>;
      },
    ) => Promise<unknown>;
  },
  command: ConfigurableCommandKey,
) {
  const [config, pending] = await Promise.all([
    getCommandFollowupStickerConfig(),
    getStickerSetupPending(),
  ]);
  const text = buildCommandStickerDetailText(
    command,
    config[command],
    pending === command,
  );
  const keyboard = ownerStickerCommandKeyboard(command);

  try {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

async function handleStickerMenuCallback(
  ctx: {
    editMessageText: (
      text: string,
      options?: {
        parse_mode?: "HTML";
        reply_markup?: ReturnType<typeof ownerStickerCommandKeyboard>;
      },
    ) => Promise<unknown>;
    reply: (
      text: string,
      options?: {
        parse_mode?: "HTML";
        reply_markup?: ReturnType<typeof ownerStickerCommandKeyboard>;
      },
    ) => Promise<unknown>;
  },
  data: string,
) {
  const parts = data.split(":");
  const command = parseConfigurableCommandKey(parts[2] ?? "");
  if (!command) return;

  const action = parts[3];

  if (!action) {
    await refreshStickerCommandPanel(ctx, command);
    return;
  }

  switch (action) {
    case "toggle": {
      const config = await getCommandFollowupStickerConfig();
      await updateCommandFollowupStickerRule(command, {
        enabled: !config[command].enabled,
      });
      await refreshStickerCommandPanel(ctx, command);
      return;
    }
    case "set":
      await setStickerSetupPending(command);
      await ctx.reply(
        `Send the sticker for <b>${command}</b> in our private chat.`,
        { parse_mode: "HTML" },
      );
      await refreshStickerCommandPanel(ctx, command);
      return;
    case "clear":
      await updateCommandFollowupStickerRule(command, { stickerId: null });
      await clearStickerSetupPending();
      await refreshStickerCommandPanel(ctx, command);
      return;
    case "min": {
      const raw = parts[4];
      const minNetOwed =
        raw === "none" ? null : Number.parseFloat(raw ?? "");
      if (raw !== "none" && Number.isNaN(minNetOwed)) return;
      await updateCommandFollowupStickerRule(command, { minNetOwed });
      await refreshStickerCommandPanel(ctx, command);
      return;
    }
  }
}

const OWNER_ID = parseInt(process.env.OWNER_TELEGRAM_ID ?? "0");

function isOwner(ctx: { from?: { id: number } }): boolean {
  return OWNER_ID > 0 && ctx.from?.id === OWNER_ID;
}

function isOwnerPrivateChat(ctx: {
  from?: { id: number };
  chat?: { type: string; id: number };
}): boolean {
  return (
    isOwner(ctx) &&
    ctx.chat?.type === "private" &&
    ctx.chat.id === OWNER_ID
  );
}

const NOT_BOSS_REPLIES = [
  "Excuse me?? 🦕 I only take orders from ONE boss, and it ain't you!",
  "Lol nice try. I have exactly one boss and you're not him. 🦖",
  "Who are you again? 🦕 My boss didn't mention anyone else.",
  "Sorry, I don't do that for strangers. Ask my actual boss. 🦖",
  "Bold of you to assume you're my boss. 🦕 Spoiler: you're not.",
  "Hmm... checking my list of bosses... nope, not you. 🦖",
  "access_denied.exe 🦕 (only Vannyou can run this command)",
  "🦖 Unauthorized. Dino's loyalty card only has one name on it: Vannyou.",
  "Nice try, impostor! 🦕 My boss would never type it like that. (Maybe.)",
  "🚫 Admin vibes detected. Boss badge not found. Try again never. 😂",
  "Dino squints at you... 🦕 Nope. Not the boss. Not even close.",
  "🔒 Command locked. Only Vannyou has the golden key. 🗝️",
];

function notBossReply(ctx: { reply: (msg: string) => unknown }) {
  const msg =
    NOT_BOSS_REPLIES[Math.floor(Math.random() * NOT_BOSS_REPLIES.length)];
  return ctx.reply(msg);
}

function formatStickerInfo(sticker: {
  file_id: string;
  file_unique_id: string;
  emoji?: string;
  set_name?: string;
  is_animated?: boolean;
  is_video?: boolean;
}): string {
  const lines = [
    "🏷️ Sticker file_id (tap to copy):",
    `<code>${sticker.file_id}</code>`,
    "",
    `Unique ID: <code>${sticker.file_unique_id}</code>`,
  ];
  if (sticker.emoji) lines.push(`Emoji: ${sticker.emoji}`);
  if (sticker.set_name) lines.push(`Set: ${sticker.set_name}`);
  const kind = sticker.is_video
    ? "video"
    : sticker.is_animated
      ? "animated"
      : "static";
  lines.push(`Type: ${kind}`);
  return lines.join("\n");
}

async function replyStickerInfo(
  ctx: {
    reply: (
      text: string,
      options?: { parse_mode?: "HTML" },
    ) => Promise<unknown>;
  },
  sticker: {
    file_id: string;
    file_unique_id: string;
    emoji?: string;
    set_name?: string;
    is_animated?: boolean;
    is_video?: boolean;
  },
) {
  return ctx.reply(formatStickerInfo(sticker), { parse_mode: "HTML" });
}

function fitnessLogReplyOptions(result: AdvanceSessionResult) {
  if (!result.keyboard) return undefined;
  return { reply_markup: { inline_keyboard: result.keyboard } };
}

async function replyFitnessLogResult(
  ctx: {
    reply: (
      text: string,
      options?: { reply_markup?: { inline_keyboard: FitnessLogKeyboard } },
    ) => Promise<unknown>;
  },
  result: AdvanceSessionResult,
) {
  await ctx.reply(result.reply, fitnessLogReplyOptions(result));
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
  "💳 Payment portal open! Scan, pay, become Dino's favorite human today. 🦕⭐",
  "🦖 The QR code is hungry. Feed it money for Vannyou. Dino is supervising.",
  "📲 Scan → Pay → Peace. It's that simple. Dino believes in you. 🦕",
];

const QR_NO_DEBT_CAPTIONS = [
  "Just browsing? 👀 No debts found — you're clean! Here's the QR anyway, just in case you feel generous. 😂",
  "Oh? You don't owe anything! 🎉 Dino approves. Here's the QR in case Vannyou's birthday is coming up. 🦕🎂",
  "No debts detected! 🧼 But hey, here's the QR code — maybe you just like scanning things. No judgment. 🦕",
  "Clean slate! ✨ You're all good with Vannyou. QR is here if you ever want to send a surprise. 💸😇",
  "Dino checked the ledger... you owe nothing! 🦕 Here's the QR anyway — feel free to tip the dino. 😂",
  "🏆 Debt-free champion! No payment needed, but the QR is here if you're feeling philanthropic. 🦖",
  "✨ Zero balance, full vibes. QR attached for optional generosity. Dino won't judge. 🦕",
  "🎁 Nothing owed — but if you want to gift Vannyou anyway, Dino won't stop you. 😏",
];

const NO_RECORD_REPLIES = [
  "Hmm, I got nothing on you 🤔 Either you're totally clean... or you just don't exist in my records yet!",
  "No records found! 👀 Either you owe nothing (nice!) or Vannyou forgot to add you 😆",
  "Clean slate! 🧼 Or maybe you're just not in the system yet. Ask Vannyou! 🦕",
  "Dino searched everywhere... nothing! 🦕 You're either debt-free or a ghost. 👻",
  "🔍 Zero hits in the database. New here? Ask Vannyou to add you! 🦖",
  "👻 Dino checked twice. No record. Either you're invisible or very lucky. 😂",
  "📭 Empty inbox! No debts, no YouTube, no deposit. Who ARE you? 🦕",
  "🦖 Dino shrugs. Nothing on file. Tell Vannyou to register you if this looks wrong.",
];

const YT_PAID_MSGS_ELDER = [
  (mention: string, month: string) =>
    `🙏 Thank you ${mention} bong for paying YouTube (${month})! You are the most reliable one here, as always! 🎉`,
  (mention: string, month: string) =>
    `✨ ${mention} bong came through again for ${month}! Consistent king/queen energy. We appreciate you! 🙌`,
  (mention: string, month: string) =>
    `💛 Thank you ${mention} bong! YouTube ${month} is settled — you never disappoint! 🙏`,
  (mention: string, month: string) =>
    `🌟 ${mention} bong paid for ${month}! As expected from the most dependable one in the group. Thank you! 🎊`,
  (mention: string, month: string) =>
    `🙏 ${mention} bong settled ${month} — the group is lucky to have you! 💛`,
  (mention: string, month: string) =>
    `✅ ${mention} bong paid YouTube ${month}! Reliable as always. Much appreciated! 🙌`,
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
  (mention: string, month: string) =>
    `🦖 ${mention} just paid ${month}! Dino is updating the "people who actually pay" hall of fame. 🏛️`,
  (mention: string, month: string) =>
    `✅ YouTube ${month} — PAID by ${mention}! Dino did not see that coming. (Just kidding. Thank you!) 😂`,
  (mention: string, month: string) =>
    `🎊 ${mention} cleared ${month}! The subscription gods are pleased. Dino is pleased. 🦕`,
  (mention: string, month: string) =>
    `💸 Money in! ${mention} paid YouTube ${month}. Vannyou smiling, Dino smiling 🥳`,
];

const YT_UNPAID_MSGS_ELDER = [
  (mention: string, month: string) =>
    `😊 Hey ${mention} bong, just a gentle heads-up — YouTube for ${month} is showing unpaid. No rush, whenever you're free! 🙏`,
  (mention: string, month: string) =>
    `🙏 ${mention} bong, Dino just wanted to let you know YouTube ${month} is still pending. Take your time! 😊`,
  (mention: string, month: string) =>
    `💛 Just a friendly nudge for ${mention} bong — ${month} YouTube hasn't been settled yet. No worries, whenever suits you! 🙏`,
  (mention: string, month: string) =>
    `🌸 ${mention} bong, gentle reminder that ${month} YouTube is still open. No pressure at all! 🙏`,
  (mention: string, month: string) =>
    `😊 ${mention} bong — whenever you have a moment, ${month} YouTube is pending. Thank you! 💛`,
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
  (mention: string, month: string) =>
    `🦖 ${mention}, ${month} YouTube is still on the unpaid list. Dino is patient... for now. 👀`,
  (mention: string, month: string) =>
    `📺 ${mention} — ${month} YouTube payment still pending. Dino sends his regards. 🦕`,
  (mention: string, month: string) =>
    `💸 Friendly ping ${mention}: ${month} YouTube ain't paid yet. Dino is just the messenger! 😅`,
  (mention: string, month: string) =>
    `⏰ ${mention} — tick tock! ${month} YouTube still open. Dino remembers everything 🦖📋`,
];

export const bot = new Bot(token);

void registerBotCommands(bot.api, OWNER_ID).catch((err) => {
  console.error("Failed to register Telegram commands:", err);
});

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
    await maybeSendCommandFollowupSticker(ctx, "start");
  },
);

bot.command("about", async (ctx) => {
  await ctx.reply(
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
      "💰 Keep prepaid deposits on file and factor them into balances\n" +
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
  await maybeSendCommandFollowupSticker(ctx, "about");
});

bot.command("qr", async (ctx) => {
  const userId = ctx.from?.id ?? 0;
  const username = ctx.from?.username ?? "";
  const firstName = ctx.from?.first_name ?? "friend";

  const net = await resolveNetOwedForTelegramUser(userId, username);

  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");

  if (net > 0) {
    const oweMessage = await buildOweMessage(userId, username, firstName);
    const caption = `${pick(QR_CAPTIONS)}${oweMessage ? `\n\n${oweMessage}` : ""}`;
    await ctx.replyWithPhoto(file, { caption });
  } else {
    await ctx.replyWithPhoto(file, { caption: pick(QR_NO_DEBT_CAPTIONS) });
  }

  await maybeSendCommandFollowupSticker(ctx, "qr", { netOwed: net });
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

  const net = await resolveNetOwedForTelegramUser(userId, username);
  await ctx.reply(message);
  await maybeSendCommandFollowupSticker(ctx, "owe", { netOwed: net });
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

  const shortcode = parseShortcodeFromMatch(ctx.match);
  if (!shortcode) {
    return promptShortcodePick(ctx, "deposits");
  }

  return ctx.reply(await buildDepositsReply(shortcode));
});

// Owner-only: /debts <shortcode>
bot.command("debts", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const shortcode = parseShortcodeFromMatch(ctx.match);
  if (!shortcode) {
    return promptShortcodePick(ctx, "debts");
  }

  return ctx.reply(await buildDebtsReply(shortcode));
});

// Owner-only: /paid <shortcode> — clear all debts + YouTube subscription
bot.command("paid", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const parts = (ctx.match?.trim() ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return promptShortcodePick(ctx, "paid");
  }

  const shortcode = parts[0].toUpperCase();
  return runPaid(ctx, shortcode, parts.slice(1));
});

async function runPaid(
  ctx: { reply: (msg: string) => unknown },
  shortcode: string,
  tailParts: string[] = [],
): Promise<unknown> {
  const { tail } = parsePaymentTail(tailParts);

  const [record, ytOwing] = await Promise.all([
    getDebtByShortcode(shortcode),
    getUnpaidYoutubeOwing(shortcode),
  ]);

  const unpaidDebt = record
    ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
    : 0;
  const paymentTotal = unpaidDebt + ytOwing.total;

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
}

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

  const ytOwing = await getUnpaidYoutubeOwing(code, months);
  const paymentTotal = ytOwing.total;
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
  const parts = (ctx.match?.trim() ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return promptShortcodePick(ctx, "ytpaidall");
  }

  const shortcode = parts[0].toUpperCase();
  return runYtpaidall(ctx, shortcode, parts.slice(1));
});

async function runYtpaidall(
  ctx: { reply: (msg: string) => unknown },
  shortcode: string,
  tailParts: string[] = [],
): Promise<unknown> {
  const { tail } = parsePaymentTail(tailParts);

  const [ytOwing] = await Promise.all([getUnpaidYoutubeOwing(shortcode)]);

  if (ytOwing.months.length === 0) {
    const allMonths = await getYouTubeMonthsForShortcode(shortcode);
    if (!allMonths.length) {
      return ctx.reply(`No YouTube months found for ${shortcode}.`);
    }
    return ctx.reply(`✅ ${shortcode} YouTube is already all paid!`);
  }

  const results = await toggleAllYouTubeMonthsPaid(shortcode, true);

  let settlementSuffix = "";
  try {
    const settlement = await settlePayment(
      shortcode,
      ytOwing.total,
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
    `✅ ${results.length} unpaid month(s) for ${shortcode} marked as paid! 🎉${settlementSuffix}`,
  );
  await notifyYtGroupBulk(
    results[0].shortcode,
    results.map((r) => r.month.slice(0, 7)),
    true,
  );
  return;
}

// Owner-only: /ytunpaidall <shortcode> — mark ALL YouTube months as unpaid
bot.command("ytunpaidall", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }
  const shortcode = parseShortcodeFromMatch(ctx.match);
  if (!shortcode) {
    return promptShortcodePick(ctx, "ytunpaidall");
  }

  return runYtunpaidall(ctx, shortcode);
});

async function runYtunpaidall(
  ctx: { reply: (msg: string) => unknown },
  shortcode: string,
): Promise<unknown> {
  const allMonths = await getYouTubeMonthsForShortcode(shortcode);
  if (!allMonths.length) {
    return ctx.reply(`No YouTube months found for ${shortcode}.`);
  }
  const paidCount = allMonths.filter((m) => m.paid).length;
  if (paidCount === 0) {
    return ctx.reply(`⏳ ${shortcode} YouTube is already all unpaid.`);
  }

  const results = await toggleAllYouTubeMonthsPaid(shortcode, false);
  if (!results.length) {
    return ctx.reply(`No YouTube months found for ${shortcode}.`);
  }
  await ctx.reply(
    `⏳ ${results.length} paid month(s) for ${shortcode} marked as unpaid. Back to square one! 😈`,
  );
  await notifyYtGroupBulk(
    results[0].shortcode,
    results.map((r) => r.month.slice(0, 7)),
    false,
  );
  return;
}

// Owner-only: /ytfees — list YouTube fee schedules
bot.command("ytfees", async (ctx) => {
  if (!isOwner(ctx)) return notBossReply(ctx);
  return ctx.reply(await buildYtFeesReply());
});

// Owner-only: /addytfee <amount> <from YYYY-MM-DD> [to YYYY-MM-DD]
bot.command("addytfee", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const parts = (ctx.match?.trim() ?? "").split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply(
      "Usage: /addytfee <amount> <from YYYY-MM-DD> [to YYYY-MM-DD]\n" +
        "  /addytfee 1.49 2026-06-15 — new rate from 15 Jun 2026\n" +
        "  /addytfee 1.19 2020-01-01 2026-05-31 — fixed period\n" +
        "  (YYYY-MM also works — treated as the 1st of that month)",
    );
  }

  const fee = parseFloat(parts[0]);
  const from = parts[1];
  const to = parts[2] ?? null;

  if (Number.isNaN(fee) || fee < 0) {
    return ctx.reply("Amount must be a non-negative number.");
  }
  if (!isDateToken(from) || (to && !isDateToken(to))) {
    return ctx.reply("Dates must be YYYY-MM-DD or YYYY-MM (e.g. 2026-06-15).");
  }

  try {
    const schedule = await addYoutubeFeeSchedule(fee, from, to);
    return ctx.reply(
      `✅ Added YouTube fee schedule:\n${formatFeeScheduleLine(schedule)}`,
    );
  } catch (err) {
    return ctx.reply(`❌ ${(err as Error).message}`);
  }
});

// Owner-only: /menu — tap-to-run admin panel
bot.command("menu", async (ctx) => {
  if (!isOwner(ctx)) return notBossReply(ctx);
  return ctx.reply(OWNER_MENU_MAIN_TEXT, {
    parse_mode: "HTML",
    reply_markup: ownerMainMenuKeyboard(),
  });
});

bot.callbackQuery(/^om:/, async (ctx) => {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: "Boss only!", show_alert: true });
    return;
  }

  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  if (data.startsWith("om:sticker:")) {
    await handleStickerMenuCallback(ctx, data);
    return;
  }

  const editSection = async (text: string, keyboard: ReturnType<typeof ownerMainMenuKeyboard>) => {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch {
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    }
  };

  switch (data) {
    case "om:main":
      await editSection(OWNER_MENU_MAIN_TEXT, ownerMainMenuKeyboard());
      break;
    case "om:debt":
      await editSection(OWNER_MENU_DEBT_TEXT, ownerDebtMenuKeyboard());
      break;
    case "om:dep":
      await editSection(OWNER_MENU_DEPOSIT_TEXT, ownerDepositMenuKeyboard());
      break;
    case "om:yt":
      await editSection(OWNER_MENU_YT_TEXT, ownerYtMenuKeyboard());
      break;
    case "om:user":
      await editSection(OWNER_MENU_USER_TEXT, ownerUserMenuKeyboard());
      break;
    case "om:prev":
      await editSection(OWNER_MENU_PREVIEW_TEXT, ownerPreviewMenuKeyboard());
      break;
    case "om:help":
      await editSection(OWNER_MENU_HELP_TEXT, ownerBackMenuKeyboard());
      break;
    case "om:stickers": {
      const config = await getCommandFollowupStickerConfig();
      await editSection(
        buildCommandStickersOverviewText(config),
        ownerStickersMenuKeyboard(),
      );
      break;
    }
    case "om:pick:debts":
      await promptShortcodePick(ctx, "debts");
      break;
    case "om:pick:deposits":
      await promptShortcodePick(ctx, "deposits");
      break;
    case "om:pick:previewowe":
      await promptShortcodePick(ctx, "previewowe");
      break;
    case "om:run:allowe":
      await ctx.reply(await buildAlloweSummary());
      break;
    case "om:run:listusers":
      await ctx.reply(await buildListUsersReply());
      break;
    case "om:run:ytfees":
      await ctx.reply(await buildYtFeesReply());
      break;
    case "om:run:previewytreminder":
      await sendYtReminderPreview(ctx);
      break;
  }
});

bot.callbackQuery(/^sc:/, async (ctx) => {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: "Boss only!", show_alert: true });
    return;
  }

  const parsed = parseShortcodeCallbackData(ctx.callbackQuery.data);
  if (!parsed) {
    await ctx.answerCallbackQuery({ text: "Unknown action", show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  const { action, shortcode } = parsed;

  switch (action) {
    case "debts":
      await ctx.reply(await buildDebtsReply(shortcode));
      break;
    case "deposits":
      await ctx.reply(await buildDepositsReply(shortcode));
      break;
    case "previewowe": {
      const message = await buildPreviewOweReply(shortcode);
      await ctx.reply(
        message ?? `No records found for ${shortcode}.`,
      );
      break;
    }
    case "paid":
      await runPaid(ctx, shortcode);
      break;
    case "ytpaidall":
      await runYtpaidall(ctx, shortcode);
      break;
    case "ytunpaidall":
      await runYtunpaidall(ctx, shortcode);
      break;
    default:
      await ctx.reply(`Unknown action: ${action}`);
  }
});

// Owner-only: /previewowe <shortcode> — preview /owe for a user by shortcode
bot.command("previewowe", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const shortcode = parseShortcodeFromMatch(ctx.match);
  if (!shortcode) {
    return promptShortcodePick(ctx, "previewowe");
  }

  const message = await buildPreviewOweReply(shortcode);
  if (!message) {
    return ctx.reply(`No records found for ${shortcode}.`);
  }

  return ctx.reply(message);
});

// Owner-only (private DM): /stickerid — show Telegram sticker file_id
bot.command("stickerid", async (ctx) => {
  if (!isOwner(ctx)) return notBossReply(ctx);
  if (!isOwnerPrivateChat(ctx)) {
    return ctx.reply("🦕 /stickerid only works in our private chat.");
  }

  const sticker = ctx.message?.reply_to_message?.sticker ?? null;
  if (!sticker) {
    return ctx.reply(
      "Send me a sticker here, or reply to one with /stickerid.\n\n" +
        "I'll reply with the file_id you can paste into bot code.",
    );
  }

  return replyStickerInfo(ctx, sticker);
});

bot.on("message:sticker", async (ctx, next) => {
  if (!isOwnerPrivateChat(ctx)) return next();

  const pending = await getStickerSetupPending();
  if (pending) {
    await assignStickerToCommand(pending, ctx.message.sticker.file_id);
    await clearStickerSetupPending();
    await ctx.reply(
      `✅ Saved follow-up sticker for <b>${pending}</b> and turned it ON.`,
      { parse_mode: "HTML" },
    );
    return;
  }

  await replyStickerInfo(ctx, ctx.message.sticker);
});

// Owner-only: /previewytreminder — preview monthly YouTube reminder in this chat
bot.command("previewytreminder", async (ctx) => {
  if (!isOwner(ctx)) return notBossReply(ctx);
  return sendYtReminderPreview(ctx);
});

// Owner-only: /allowe — summary of everyone who owes anything
bot.command("allowe", async (ctx) => {
  if (!isOwner(ctx)) return notBossReply(ctx);
  return ctx.reply(await buildAlloweSummary());
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
  if (!isOwner(ctx)) return notBossReply(ctx);
  return ctx.reply(await buildListUsersReply());
});

// Owner-only: /help — list all commands
bot.command("fit", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = ctx.match?.trim() ?? "";
  if (!args) {
    const { reply } = await startSession(ctx.from.id);
    return ctx.reply(reply);
  }

  const split = splitFitCommandArgs(args);
  if (!split.ok) {
    return ctx.reply(split.error);
  }

  if (!split.rest) {
    const { reply } = await startSession(ctx.from.id, split.logDate);
    return ctx.reply(reply);
  }

  const result = await submitQuickLog(ctx.from.id, args);
  return ctx.reply(result.reply);
});

bot.command("cancelfit", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const session = await getSession(ctx.from.id);
  if (!session) {
    return ctx.reply("No active log session to cancel.");
  }

  await cancelSession(ctx.from.id);
  return ctx.reply("Log session cancelled.");
});

bot.command("fithistory", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const args = ctx.match?.trim() ?? "";
  const days = args ? parseInt(args, 10) : 30;
  if (args && (Number.isNaN(days) || days <= 0)) {
    return ctx.reply("Usage: /fithistory [days]\nExample: /fithistory 30");
  }

  const logs = await getLogHistory(days);
  return ctx.reply(formatLogHistory(logs, days), { parse_mode: "HTML" });
});

bot.command("gymreminder", async (ctx) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return notBossReply(ctx);
  }

  const arg = (ctx.match?.trim() ?? "").toLowerCase();

  if (!arg) {
    const enabled = await isGymMotivationReminderEnabled();
    return ctx.reply(
      `${formatGymMotivationReminderStatus(enabled)}\n\n` +
        "Toggle with:\n" +
        "/gymreminder on\n" +
        "/gymreminder off",
    );
  }

  if (arg === "on") {
    await setGymMotivationReminderEnabled(true);
    return ctx.reply(
      "✅ " + formatGymMotivationReminderStatus(true) + " 🦕",
    );
  }

  if (arg === "off") {
    await setGymMotivationReminderEnabled(false);
    return ctx.reply(
      "✅ " + formatGymMotivationReminderStatus(false) + " 🦕",
    );
  }

  return ctx.reply(
    "Usage:\n/gymreminder — show status\n/gymreminder on\n/gymreminder off",
  );
});

bot.on("message:text", async (ctx, next) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return next();
  }

  const text = ctx.message.text.trim();
  if (text.startsWith("/")) {
    return next();
  }

  const session = await getSession(ctx.from.id);
  if (!session) {
    return next();
  }

  const result = await advanceSession(ctx.from.id, text);
  await replyFitnessLogResult(ctx, result);
});

bot.on("callback_query:data", async (ctx, next) => {
  if (!OWNER_ID || ctx.from?.id !== OWNER_ID) {
    return next();
  }

  const data = ctx.callbackQuery.data;
  if (!data.startsWith(`${FITNESS_LOG_CALLBACK_PREFIX}:`)) {
    return next();
  }

  const input = parseFitnessLogCallback(data);
  if (!input) {
    await ctx.answerCallbackQuery({ text: "Invalid button." });
    return;
  }

  const session = await getSession(ctx.from.id);
  if (!session) {
    await ctx.answerCallbackQuery({
      text: "Session expired. Send /fit to start.",
    });
    return;
  }

  const result = await advanceSession(ctx.from.id, input);
  await ctx.answerCallbackQuery();
  await replyFitnessLogResult(ctx, result);
});

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
      "  /fithistory [days]\n" +
      "    → Gym dot grid + recent logs (default 30 days)\n" +
      "  /gymreminder [on|off]\n" +
      "    → Weekday 4:45 PM gym motivation DM (default on)",
  );
});
