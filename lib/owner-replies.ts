import fs from "fs";
import path from "path";
import type { Context } from "grammy";
import { InputFile } from "grammy";
import { getAllDebtRecords } from "./debt";
import { getAllDepositTotals } from "./deposit";
import { calculateNetOwed } from "./owe-message";
import {
  getYoutubeFeeSchedules,
  getCurrentYoutubeMonthlyFee,
  formatFeeScheduleLine,
  getYoutubeReminderOwings,
  resolveYoutubeFeeAnnouncement,
} from "./youtube-fee";
import {
  buildReminderMessage,
  REMINDER_PARSE_MODE,
  getAllTelegramUsers,
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
