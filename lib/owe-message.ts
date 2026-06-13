import type { DebtRecord } from "./debt";
import { getDebtByUsername, getDebtByUserId } from "./debt";
import { resolveDepositForTelegramUser } from "./deposit";
import {
  getUnpaidYoutubeOwing,
  formatYoutubeMonthSummary,
} from "./youtube-fee";
import type { SubscriptionMember } from "./youtube-subscription";
import {
  getMemberByTelegramIdentity,
  getMemberByUsername,
} from "./youtube-subscription";

/** Resolve ledger debt: stub row by Telegram username first, then linked row by user id. */
export async function resolveDebtForTelegramUser(
  userId: number,
  username: string,
): Promise<DebtRecord | null> {
  const handle = username.trim();
  if (handle) {
    const byUsername = await getDebtByUsername(handle);
    if (byUsername) return byUsername;
  }
  if (userId) {
    return getDebtByUserId(userId);
  }
  return null;
}

/** Resolve YouTube subscription member: same username-first, then Telegram user id. */
export async function resolveSubscriptionMemberForTelegramUser(
  userId: number,
  username: string,
): Promise<SubscriptionMember | null> {
  const handle = username.trim();
  if (handle) {
    const byUsername = await getMemberByUsername(handle);
    if (byUsername) return byUsername;
  }
  if (userId) {
    return getMemberByTelegramIdentity(userId);
  }
  return null;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const GREETINGS = [
  (name: string, username: string) =>
    username
      ? `👀 Hey ${name} (@${username}), let's check your tab...`
      : `👀 Hey ${name}, let's check your tab...`,
  (name: string, username: string) =>
    username
      ? `🦕 Dino is pulling up your records, ${name} (@${username})...`
      : `🦕 Dino is pulling up your records, ${name}...`,
  (name: string, username: string) =>
    username
      ? `📋 Alright ${name} (@${username}), time to face the music 🎵`
      : `📋 Alright ${name}, time to face the music 🎵`,
  (name: string, username: string) =>
    username
      ? `💼 Opening the books for ${name} (@${username}) 👇`
      : `💼 Opening the books for ${name} 👇`,
  (name: string, username: string) =>
    username
      ? `🦖 Ledger time, ${name} (@${username}). Dino brought popcorn. 🍿`
      : `🦖 Ledger time, ${name}. Dino brought popcorn. 🍿`,
  (name: string, username: string) =>
    username
      ? `🔍 ${name} (@${username}), let's see what the numbers say...`
      : `🔍 ${name}, let's see what the numbers say...`,
  (name: string, username: string) =>
    username
      ? `👋 Yo ${name} (@${username}) — Dino's got your balance right here`
      : `👋 Yo ${name} — Dino's got your balance right here`,
  (name: string, username: string) =>
    username
      ? `📊 Financial report for ${name} (@${username}), courtesy of Nailong 🦕`
      : `📊 Financial report for ${name}, courtesy of Nailong 🦕`,
];

const YT_SLEEPING_ON = [
  (total: string) => `📺 YouTube you've been sleeping on: $${total}`,
  (total: string) => `📺 YouTube subscription collecting dust: $${total}`,
  (total: string) => `😅 YouTube: still unpaid btw — $${total}`,
  (total: string) => `📺 YouTube tab (in case you forgot): $${total}`,
  (total: string) => `📺 YouTube balance doing the side-eye thing: $${total}`,
  (total: string) => `🦕 Dino found unpaid YouTube months worth $${total}`,
  (total: string) => `📺 Streaming debt alert: $${total} on YouTube`,
  (total: string) => `😬 YouTube subscription: $${total} still pending`,
];

const NET_OWE_ME = [
  (amount: string) =>
    `💸 Bottom line: you owe Vannyou $${amount} — go pay up! 😅`,
  (amount: string) =>
    `😬 So yeah... $${amount} still owed to Vannyou. Just saying! 👀`,
  (amount: string) =>
    `💰 Grand total you owe: $${amount}. Venmo? KHQR? Cash? Dino accepts all! 🦕`,
  (amount: string) =>
    `🧾 Tab total: $${amount} owed to Vannyou. The QR code is waiting for you! 😂`,
  (amount: string) =>
    `🦕 Final verdict: $${amount} to Vannyou. No appeals. Pay up! 😂`,
  (amount: string) =>
    `💸 Net damage: $${amount}. Dino believes in you (to pay). 🙏`,
  (amount: string) =>
    `📉 Your balance with Vannyou: -$${amount}. Fix it before Dino sends another reminder! 🦖`,
  (amount: string) =>
    `🧮 Math checked twice: you owe $${amount}. Dino doesn't make typos. 📋`,
];

const I_OWE_THEM = [
  (amount: string) =>
    `🤑 Vannyou owes you: $${amount} — Dino marked this as a rare boss L. Go collect!`,
  (amount: string) =>
    `👑 Boss debt alert: Vannyou owes you $${amount}. Dino had to fan himself after reading this.`,
  (amount: string) =>
    `🦄 Unicorn moment: Vannyou is down $${amount} with you. Dino recommends screenshot evidence.`,
  (amount: string) =>
    `📉 Vannyou tab: -$${amount} (yes, negative). Dino is as shocked as you are.`,
  (amount: string) =>
    `🎰 Jackpot? Vannyou owes you $${amount}. Dino has never seen this energy before. 😂`,
  (amount: string) =>
    `🦕 Historic ledger entry: Vannyou owes you $${amount}. Nailong approves this chaos.`,
  (amount: string) =>
    `🏦 Vannyou's tab with you: $${amount} in YOUR favor. Dino is taking notes. 📝`,
  (amount: string) =>
    `🎁 Surprise! Vannyou owes you $${amount}. Don't let him pretend he forgot. 😏`,
];

const DEPOSIT_ON_FILE = [
  (amount: string) => `💰 Your deposit with Vannyou: $${amount}`,
  (amount: string) => `💰 Prepaid credit on file: $${amount} (Dino is guarding it 🦕)`,
  (amount: string) => `💰 You've got $${amount} sitting with Vannyou like a VIP tab`,
  (amount: string) => `💰 Deposit balance: $${amount} — your money, his problem 😌`,
  (amount: string) => `💰 $${amount} in your Vannyou wallet. Not debt. Power move.`,
  (amount: string) => `💰 Credit available: $${amount}. Dino notes you planned ahead 👀`,
  (amount: string) => `💰 $${amount} prepaid — like a buffet card for future payments 🎟️`,
  (amount: string) => `💰 Deposit stash: $${amount}. Dino respects the foresight. 🦖`,
];

const RARE_VANNYOU_OWES_YOU = [
  "🚨 RARE EVENT DETECTED 🦕 Dino ran the numbers three times. Same result. Vannyou owes YOU money. This is not a drill.",
  "🦄 Hold up. Dino has been doing this job for a while and this almost never happens. Vannyou is in the red with you. Screenshot it. 📸",
  "🦕 Dino had to sit down for this one. Vannyou owing someone? Statistically rarer than a paid YouTube month on day one. 😂",
  "⚠️ Breaking: local dino discovers Vannyou owes a human money. Scientists are confused. Vannyou is probably confused too.",
  "🎰 You just hit the rarest outcome on Dino's ledger slot machine. Vannyou owes YOU. Frame this message. Put it in a museum.",
  "🦖 Alert level: mythical. Vannyou owing you is like seeing Nailong skip a meal — technically possible, deeply suspicious.",
  "🛸 Dino is filing this under 'unnatural events'. Vannyou owing you should come with background music.",
  "📯 Dino blew the rare-event trumpet 🎺 Vannyou owes YOU. Witnesses recommended.",
  "🧪 Lab result: 99.9% of tabs end with you owing Vannyou. You got the 0.1%. Enjoy responsibly.",
  "🦕 Dino refreshed the page. Still true. Vannyou owes you. Reality is buffering.",
  "🏆 Achievement unlocked: Make Vannyou Owe You. Dino is emotionally unprepared.",
  "🌋 Financial volcano status: dormant for years, erupted today. Vannyou owes YOU.",
  "🎪 Welcome to the circus. Main attraction: Vannyou in debt to a regular human.",
  "🦖 Dino checked with management. Management (Vannyou) is also surprised.",
];

const NET_I_OWE = [
  (amount: string) =>
    `🤑 Bottom line: Vannyou owes you $${amount}. Go collect before physics corrects itself! 🏃`,
  (amount: string) =>
    `💰 Plot twist of the century: Vannyou owes you $${amount}. Dino still doesn't trust it. 👀`,
  (amount: string) =>
    `🎊 Impossible-ish news! Vannyou owes YOU $${amount}. Hunt him down while the timeline is still valid! 🏃💨`,
  (amount: string) =>
    `🦄 Rare drop unlocked: Vannyou in debt to you — $${amount}. Cherish this moment. It may never happen again. 😂`,
  (amount: string) =>
    `🦕 Dino triple-checked. Vannyou owes you $${amount}. He'll deny it. The database won't. 📋`,
  (amount: string) =>
    `✨ Congratulations! You found a glitch in the natural order: Vannyou owes you $${amount}. 🎉`,
  (amount: string) =>
    `📢 Historic moment: Vannyou owes $${amount} to YOU. Tell your grandchildren. Dino is witness. 🦕`,
  (amount: string) =>
    `🎯 Final score: Vannyou -$${amount}, You +$${amount}. Dino needs a minute.`,
  (amount: string) =>
    `🧾 Official tab: Vannyou owes you $${amount}. Keep this message as legal-ish proof. 😂`,
  (amount: string) =>
    `🚨 Collect $${amount} from Vannyou before the universe patches this bug.`,
  (amount: string) =>
    `🦖 Dino declares today a holiday: Vannyou owes you $${amount}.`,
  (amount: string) =>
    `💎 You are holding a $${amount} boss coupon. Redeem with confidence.`,
  (amount: string) =>
    `🏃 Run, don't walk — Vannyou owes you $${amount} and Dino is cheering from the sidelines.`,
  (amount: string) =>
    `🎬 End credits scene: Vannyou owes you $${amount}. Main character energy.`,
];

const ALL_SETTLED = [
  "✨ You're all clean! Nothing owed. Dino is proud of you 🦕",
  "🎉 All settled up! You and Vannyou are even. Live in peace! 🕊️",
  "🦕 Zero balance! Dino approves. You're officially a good person today! ✅",
  "💚 Nothing owed, nothing due. Clean money, clean conscience! 😇",
  "🏆 Debt-free status achieved! Dino is doing a little victory dance. 🦖",
  "✅ Tab closed. Balance zero. Dino salutes you. 🫡",
  "🌟 Financially zen. No debts, no drama. Dino is impressed. 😌",
  "🧼 Spotless ledger! You and Vannyou are square. Dino can rest now. 🦕",
  "🎊 ZERO. NADA. ZILCH. Dino checked three times because he didn't believe it. 🦖",
  "🦕 Dino whispered: 'finally, a peaceful soul.' Nothing owed. Go touch grass. 🌿",
  "💸 Your wallet and Vannyou's wallet shook hands and agreed to disagree. Settled! 🤝",
  "🧘 You have achieved financial enlightenment: owe nothing, fear nothing. Dino bows. 🙏",
  "🎬 Roll credits — no debts, no cliffhanger. Dino gives this episode 5 stars. ⭐",
  "🦖 Dino deleted your name from the 'chase list.' You're free. Fly, birdie. 🕊️",
  "🍾 Pop the imaginary champagne! Balance zero. Dino is not sending a reminder. Ever. 😂",
  "👑 Crown status: Debtless Royalty. Vannyou has no claim on you today. 👸",
  "🎰 You hit the jackpot: $0 owed. Dino is suspicious but happy. 🦕",
  "📭 Inbox empty, guilt empty, balance empty. This is what peace feels like. ✨",
  "🦕 Dino stamped your file: APPROVED. No payment. No chase. Just vibes. 😌",
  "🏖️ Consider yourself on financial vacation. Nothing due. Dino is jealous. 🌴",
  "🎯 Bullseye: perfectly even with Vannyou. Dino has nothing to nag you about. 🦖",
  "🧊 Your debt meter is frozen at zero. Dino won't poke it. Probably. 😏",
  "🎪 Ladies and gentlemen — a balanced tab! Dino drops the mic. 🎤",
  "🦕 Nailong declares you 'certified chill.' Zero owed. Carry on. ✌️",
];

export function calculateNetOwed(params: {
  owes_me: number;
  i_owe: number;
  deposit: number;
  subOwed: number;
}): number {
  return params.owes_me + params.subOwed - params.i_owe - params.deposit;
}

export async function buildOweMessage(
  userId: number,
  username: string,
  firstName: string,
): Promise<string | null> {
  const [record, subscriptionMember, deposit] = await Promise.all([
    resolveDebtForTelegramUser(userId, username),
    resolveSubscriptionMemberForTelegramUser(userId, username),
    resolveDepositForTelegramUser(userId, username),
  ]);

  const ytOwing =
    subscriptionMember && subscriptionMember.unpaid_count > 0
      ? await getUnpaidYoutubeOwing(subscriptionMember.id)
      : { total: 0, months: [] };

  const depositTotal = deposit ?? 0;

  if (!record && !subscriptionMember && depositTotal === 0) return null;

  const name =
    record?.name ??
    firstName ??
    record?.shortcode ??
    subscriptionMember?.id ??
    username;
  const lines: string[] = [pick(GREETINGS)(name, username), ""];

  const unpaidItems = record?.items.filter((item) => !item.paid) ?? [];

  if (record && record.owes_me > 0) {
    lines.push(`😬 You owe Vannyou: $${record.owes_me.toFixed(2)}`);
    lines.push("  What for:");
    for (const item of unpaidItems) {
      lines.push(
        `  • ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  }

  if (record && record.i_owe > 0) {
    lines.push(pick(I_OWE_THEM)(record.i_owe.toFixed(2)));
  }

  if (subscriptionMember && subscriptionMember.unpaid_count > 0) {
    lines.push("");
    lines.push(pick(YT_SLEEPING_ON)(ytOwing.total.toFixed(2)));
    lines.push(`  • ${formatYoutubeMonthSummary(ytOwing)}`);
  }

  const debtOwesMe = record?.owes_me ?? 0;
  const debtIOwe = record?.i_owe ?? 0;
  const subOwed = ytOwing.total;

  if (depositTotal > 0) {
    lines.push("");
    lines.push(pick(DEPOSIT_ON_FILE)(depositTotal.toFixed(2)));
  }

  const net = calculateNetOwed({
    owes_me: debtOwesMe,
    i_owe: debtIOwe,
    deposit: depositTotal,
    subOwed,
  });

  lines.push("");
  if (net > 0) {
    lines.push(pick(NET_OWE_ME)(net.toFixed(2)));
  } else if (net < 0) {
    lines.push(pick(RARE_VANNYOU_OWES_YOU));
    lines.push("");
    lines.push(pick(NET_I_OWE)(Math.abs(net).toFixed(2)));
  } else {
    lines.push(pick(ALL_SETTLED));
  }

  return lines.join("\n");
}
