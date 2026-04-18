import { getDebtByUsername, getDebtByUserId } from "./debt";
import {
  getMemberByTelegramIdentity,
  getMemberByUsername,
  getConfig,
} from "./youtube-subscription";

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
];

const YT_SLEEPING_ON = [
  (total: string) => `📺 YouTube you've been sleeping on: $${total}`,
  (total: string) => `📺 YouTube subscription collecting dust: $${total}`,
  (total: string) => `😅 YouTube: still unpaid btw — $${total}`,
  (total: string) => `📺 YouTube tab (in case you forgot): $${total}`,
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
];

const NET_I_OWE = [
  (amount: string) =>
    `🤑 Bottom line: Vannyou owes you $${amount} — go chase him! 🏃`,
  (amount: string) =>
    `💰 Vannyou is in the red with you — he owes $${amount}. Go collect! 😤`,
  (amount: string) =>
    `🎊 Good news! Vannyou owes YOU $${amount}. Time to hunt him down! 🏃💨`,
];

const ALL_SETTLED = [
  "✨ You're all clean! Nothing owed. Dino is proud of you 🦕",
  "🎉 All settled up! You and Vannyou are even. Live in peace! 🕊️",
  "🦕 Zero balance! Dino approves. You're officially a good person today! ✅",
  "💚 Nothing owed, nothing due. Clean money, clean conscience! 😇",
];

export async function buildOweMessage(
  userId: number,
  username: string,
  firstName: string,
): Promise<string | null> {
  // Prefer userId lookup (works even without a username)
  const debtPromise = userId
    ? getDebtByUserId(userId).then(
        (r) => r ?? (username ? getDebtByUsername(username) : null),
      )
    : username
      ? getDebtByUsername(username)
      : Promise.resolve(null);

  const memberPromise = userId
    ? getMemberByTelegramIdentity(userId)
    : username
      ? getMemberByUsername(username)
      : Promise.resolve(null);

  const [record, subscriptionMember, monthlyFee] = await Promise.all([
    debtPromise,
    memberPromise,
    getConfig("youtube_monthly_fee").then(parseFloat),
  ]);

  if (!record && !subscriptionMember) return null;

  const name =
    record?.name ??
    firstName ??
    record?.shortcode ??
    subscriptionMember?.id ??
    username;
  const lines: string[] = [pick(GREETINGS)(name, username), ""];

  if (record && record.owes_me > 0) {
    lines.push(`😬 You owe Vannyou: $${record.owes_me.toFixed(2)}`);
    lines.push("  What for:");
    for (const item of record.items) {
      lines.push(
        `  • ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  }

  if (record && record.i_owe > 0) {
    lines.push(
      `🤑 Vannyou owes you: $${record.i_owe.toFixed(2)} — go collect!`,
    );
  }

  if (subscriptionMember && subscriptionMember.unpaid_count > 0) {
    const subTotal = subscriptionMember.unpaid_count * monthlyFee;
    lines.push("");
    lines.push(pick(YT_SLEEPING_ON)(subTotal.toFixed(2)));
    lines.push(
      `  • ${subscriptionMember.unpaid_count} month(s) × $${monthlyFee.toFixed(2)}/month`,
    );
  }

  const debtOwesMe = record?.owes_me ?? 0;
  const debtIOwe = record?.i_owe ?? 0;
  const subOwed =
    subscriptionMember && subscriptionMember.unpaid_count > 0
      ? subscriptionMember.unpaid_count * monthlyFee
      : 0;
  const net = debtOwesMe + subOwed - debtIOwe;

  lines.push("");
  if (net > 0) {
    lines.push(pick(NET_OWE_ME)(net.toFixed(2)));
  } else if (net < 0) {
    lines.push(pick(NET_I_OWE)(Math.abs(net).toFixed(2)));
  } else {
    lines.push(pick(ALL_SETTLED));
  }

  return lines.join("\n");
}
