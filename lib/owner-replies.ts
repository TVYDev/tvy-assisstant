import fs from "fs";
import path from "path";
import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getAllDebtRecords, getDebtByShortcode } from "./debt";
import {
  getAllDepositTotals,
  getDepositBalanceByShortcode,
  getDepositTransactions,
} from "./deposit";
import {
  buildOweMessageForShortcode,
  calculateNetOwed,
} from "./owe-message";
import {
  getYoutubeFeeSchedules,
  getCurrentYoutubeMonthlyFee,
  formatFeeScheduleLine,
  getYoutubeReminderOwings,
  resolveYoutubeFeeAnnouncement,
  resolveFeeForMonth,
  sumMonthCharges,
} from "./youtube-fee";
import {
  buildReminderMessage,
  REMINDER_PARSE_MODE,
  getAllTelegramUsers,
  getMemberByShortcode,
  getYouTubeMonthsForShortcode,
} from "./youtube-subscription";

export async function buildAlloweSummary(): Promise<string> {
  const [debtRecords, ytOwings, allUsers, depositTotals] = await Promise.all([
    getAllDebtRecords(),
    getYoutubeReminderOwings(),
    getAllTelegramUsers(),
    getAllDepositTotals(),
  ]);

  const debtMap = new Map(debtRecords.map((r) => [r.shortcode, r]));
  const ytMap = new Map(ytOwings.map((o) => [o.id, o]));
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
    const ytOwing = ytMap.get(code);
    const ytUnpaid = ytOwing?.months.length ?? 0;
    const unpaidDebt = record
      ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
      : 0;
    const ytTotal = ytOwing?.total ?? 0;
    const deposit = depositTotals.get(code) ?? 0;
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

  return lines.join("\n");
}

export async function buildListUsersReply(): Promise<string> {
  const users = await getAllTelegramUsers();
  if (users.length === 0) return "🤔 No users found in the database yet.";

  const lines = users.map((u) => {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    const username = u.telegram_username ? ` @${u.telegram_username}` : "";
    const id = u.telegram_user_id ? ` [${u.telegram_user_id}]` : " [no ID]";
    const code = u.shortcode ? `[${u.shortcode}]` : "[no shortcode]";
    return `${code} ${name}${username}${id}`;
  });

  return `👥 All users (${users.length}):\n\n${lines.join("\n")}`;
}

export async function buildYtFeesReply(): Promise<string> {
  const schedules = await getYoutubeFeeSchedules();
  if (!schedules.length) return "No YouTube fee schedules configured.";

  const current = await getCurrentYoutubeMonthlyFee();
  return [
    `📺 YouTube fee schedules (current month: $${current.toFixed(2)}/mo)`,
    "",
    ...schedules.map((s) => `  ${formatFeeScheduleLine(s)}`),
  ].join("\n");
}

export async function sendYtReminderPreview(
  ctx: Pick<Context, "replyWithPhoto">,
): Promise<void> {
  const [owings, depositTotals, feeAnnouncement] = await Promise.all([
    getYoutubeReminderOwings(),
    getAllDepositTotals(),
    resolveYoutubeFeeAnnouncement(),
  ]);

  const caption =
    "🔍 <b>Preview</b> — same as the monthly cron (not posted to group)\n\n" +
    buildReminderMessage(owings, depositTotals, {
      feeAnnouncement: feeAnnouncement.text ?? undefined,
    });

  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");

  await ctx.replyWithPhoto(file, {
    caption,
    parse_mode: REMINDER_PARSE_MODE,
  });
}

export async function buildDebtsReply(shortcode: string): Promise<string> {
  const code = shortcode.toUpperCase();
  const [record, ytMember, deposit, schedules] = await Promise.all([
    getDebtByShortcode(code),
    getMemberByShortcode(code),
    getDepositBalanceByShortcode(code),
    getYoutubeFeeSchedules(),
  ]);

  const ytMonths = ytMember ? await getYouTubeMonthsForShortcode(code) : [];
  const unpaidYtMonths = ytMonths.filter((m) => !m.paid);
  const unpaidYt = sumMonthCharges(unpaidYtMonths, schedules, false).total;

  const lines: string[] = [
    `📋 Debts for ${code}${record ? ` (${record.name})` : ""}`,
    "",
  ];

  const unpaidDebtItems = record ? record.items.filter((i) => !i.paid) : [];
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

  if (ytMember) {
    lines.push("");
    if (unpaidYtMonths.length > 0) {
      lines.push("📺 YouTube months (unpaid):");
      for (const m of unpaidYtMonths) {
        const fee = resolveFeeForMonth(schedules, m.month);
        lines.push(`  ⏳ ${m.month.slice(0, 7)} — $${fee.toFixed(2)}`);
      }
    } else {
      lines.push("📺 YouTube: all paid up! ✅");
    }
  }

  const unpaidDebt = record
    ? record.items.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0)
    : 0;
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

  return lines.join("\n");
}

export async function buildDepositsReply(shortcode: string): Promise<string> {
  const code = shortcode.toUpperCase();
  const [balance, transactions] = await Promise.all([
    getDepositBalanceByShortcode(code),
    getDepositTransactions(code),
  ]);

  const lines: string[] = [
    `💰 Deposits for ${code}`,
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

  return lines.join("\n");
}

export async function buildPreviewOweReply(
  shortcode: string,
): Promise<string | null> {
  const message = await buildOweMessageForShortcode(shortcode);
  if (!message) return null;
  return `🔍 Preview — /owe for ${shortcode.toUpperCase()} (only you see this)\n\n${message}`;
}
