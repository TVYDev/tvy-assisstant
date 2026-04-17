import { getDebtByUsername } from "./debt";
import {
  getMemberByTelegramIdentity,
  getMemberByUsername,
  getConfig,
} from "./youtube-subscription";

export async function buildOweMessage(
  userId: number,
  username: string,
): Promise<string | null> {
  const [record, subscriptionMember, monthlyFee] = await Promise.all([
    getDebtByUsername(username),
    userId
      ? getMemberByTelegramIdentity(userId)
      : getMemberByUsername(username),
    getConfig("youtube_monthly_fee").then(parseFloat),
  ]);

  if (!record && !subscriptionMember) return null;

  const name = record?.name ?? username;
  const lines: string[] = [`Balance summary for ${name} (@${username})`, ""];

  if (record && record.owes_me > 0) {
    lines.push(`💸 You owe Vannyou: $${record.owes_me.toFixed(2)}`);
    lines.push("  Items:");
    for (const item of record.items) {
      lines.push(
        `  • ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  }

  if (record && record.i_owe > 0) {
    lines.push(`💰 Vannyou owes you: $${record.i_owe.toFixed(2)}`);
  }

  if (subscriptionMember && subscriptionMember.months_unpaid > 0) {
    const subTotal = subscriptionMember.months_unpaid * monthlyFee;
    lines.push("");
    lines.push(`📺 YouTube subscription: $${subTotal.toFixed(2)}`);
    lines.push(
      `  • ${subscriptionMember.months_unpaid} month(s) × $${monthlyFee.toFixed(2)}`,
    );
  }

  const debtOwesMe = record?.owes_me ?? 0;
  const debtIOwe = record?.i_owe ?? 0;
  const subOwed =
    subscriptionMember && subscriptionMember.months_unpaid > 0
      ? subscriptionMember.months_unpaid * monthlyFee
      : 0;
  const net = debtOwesMe + subOwed - debtIOwe;

  lines.push("");
  if (net > 0) {
    lines.push(`📊 Net: you owe Vannyou $${net.toFixed(2)}`);
  } else if (net < 0) {
    lines.push(`📊 Net: Vannyou owes you $${Math.abs(net).toFixed(2)}`);
  } else {
    lines.push("📊 Net: all settled up!");
  }

  return lines.join("\n");
}
