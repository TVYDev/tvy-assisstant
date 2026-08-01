import fs from "fs";
import path from "path";
import { InputFile } from "grammy";
import {
  insertCurrentMonthForAll,
  buildReminderMessage,
  REMINDER_PARSE_MODE,
} from "./youtube-subscription";
import { getAllDepositTotals } from "./deposit";
import {
  getYoutubeReminderOwings,
  resolveYoutubeFeeAnnouncement,
  markYoutubeFeeScheduleAnnounced,
} from "./youtube-fee";
import {
  buildMorningReminderMessage,
  buildGymMotivationMessage,
  getLogForDate,
  isGymMotivationReminderEnabled,
  isWeekdayInPhnomPenh,
  todayInPhnomPenh,
} from "./fitness-log";
import type { CronJobResult } from "./cron-job-result";

export type { CronJobResult } from "./cron-job-result";
export { formatCronJobReply } from "./cron-job-result";

async function getBotApi() {
  const { bot } = await import("./bot");
  return bot.api;
}

export async function runYoutubeReminderCron(options: {
  dryRun?: boolean;
  chatIdOverride?: string;
} = {}): Promise<CronJobResult> {
  const dryRun = options.dryRun ?? false;
  const groupChatId =
    options.chatIdOverride ?? process.env.YOUTUBE_GROUP_CHAT_ID;
  if (!groupChatId) {
    return { ok: false, error: "YOUTUBE_GROUP_CHAT_ID is not set" };
  }

  if (!dryRun) await insertCurrentMonthForAll();
  const [owings, depositTotals, feeAnnouncement] = await Promise.all([
    getYoutubeReminderOwings(),
    getAllDepositTotals(),
    resolveYoutubeFeeAnnouncement(),
  ]);

  const qrPath = path.join(process.cwd(), "data", "qr.jpeg");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.jpeg");
  const caption = buildReminderMessage(owings, depositTotals, {
    feeAnnouncement: feeAnnouncement.text ?? undefined,
  });

  const api = await getBotApi();
  await api.sendPhoto(groupChatId, file, {
    caption,
    parse_mode: REMINDER_PARSE_MODE,
  });

  if (!dryRun && feeAnnouncement.scheduleIdToMark !== null) {
    await markYoutubeFeeScheduleAnnounced(feeAnnouncement.scheduleIdToMark);
  }

  return { ok: true, dryRun, chatId: groupChatId };
}

export async function runFitnessReminderCron(options: {
  dryRun?: boolean;
  force?: boolean;
} = {}): Promise<CronJobResult> {
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;

  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!ownerId) {
    return { ok: false, error: "OWNER_TELEGRAM_ID is not set" };
  }

  const logDate = todayInPhnomPenh();
  const existing = await getLogForDate(logDate);
  if (!force && existing) {
    return {
      ok: true,
      dryRun,
      skipped: true,
      reason: "already_logged",
      logDate,
    };
  }

  const message = buildMorningReminderMessage();
  if (!dryRun) {
    const api = await getBotApi();
    await api.sendMessage(ownerId, message);
  }

  return {
    ok: true,
    dryRun,
    skipped: false,
    logDate,
    chatId: ownerId,
  };
}

export async function runGymMotivationCron(options: {
  dryRun?: boolean;
  force?: boolean;
} = {}): Promise<CronJobResult> {
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;

  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!ownerId) {
    return { ok: false, error: "OWNER_TELEGRAM_ID is not set" };
  }

  if (!force && !isWeekdayInPhnomPenh()) {
    return { ok: true, dryRun, skipped: true, reason: "weekend" };
  }

  const enabled = await isGymMotivationReminderEnabled();
  if (!force && !enabled) {
    return { ok: true, dryRun, skipped: true, reason: "disabled" };
  }

  const message = buildGymMotivationMessage();
  if (!dryRun) {
    const api = await getBotApi();
    await api.sendMessage(ownerId, message);
  }

  return { ok: true, dryRun, skipped: false, chatId: ownerId };
}
