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
import {
  claimDueReminders,
  formatReminderMessage,
  listDueReminders,
  reminderDoneKeyboard,
} from "./reminders";
import { and, eq, sql } from "drizzle-orm";
import { fetchCambridgeWordOfTheDay, formatWordLesson } from "./cambridge-word";
import { getDb } from "./db";
import { words } from "./db/schema";
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

function formatWordSummary(entry: {
  word: string;
  pronounciationRegion: string | null;
  pronounciation: string | null;
  definition: string;
}): string {
  const spoken = [entry.pronounciationRegion, entry.pronounciation]
    .filter(Boolean)
    .join(" ");
  const pronunciation = spoken ? ` [${spoken}]` : "";
  return `${entry.word}${pronunciation} — ${entry.definition}`;
}

export async function runWordOfTheDayCron(
  options: { dryRun?: boolean } = {},
): Promise<CronJobResult> {
  const dryRun = options.dryRun ?? false;
  const entry = await fetchCambridgeWordOfTheDay();
  const summary = formatWordSummary(entry);

  const db = getDb();
  const [existing] = await db
    .select({ id: words.id })
    .from(words)
    .where(
      and(
        eq(words.word, entry.word),
        sql`((${words.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Phnom_Penh')::date = (NOW() AT TIME ZONE 'Asia/Phnom_Penh')::date`,
      ),
    )
    .limit(1);

  if (existing) {
    return { ok: true, dryRun, skipped: true, reason: "already_saved", summary };
  }

  if (!dryRun) {
    await db.insert(words).values({
      word: entry.word,
      definition: entry.definition,
      pronounciationRegion: entry.pronounciationRegion,
      pronounciation: entry.pronounciation,
    });
  }

  return { ok: true, dryRun, skipped: false, summary };
}

export async function runRandomWordCron(
  options: { dryRun?: boolean } = {},
): Promise<CronJobResult> {
  const dryRun = options.dryRun ?? false;
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!ownerId) {
    return { ok: false, error: "OWNER_TELEGRAM_ID is not set" };
  }

  const db = getDb();
  const [entry] = await db
    .select({
      word: words.word,
      definition: words.definition,
      pronounciationRegion: words.pronounciationRegion,
      pronounciation: words.pronounciation,
    })
    .from(words)
    .orderBy(sql`RANDOM()`)
    .limit(1);

  if (!entry) {
    return { ok: true, dryRun, skipped: true, reason: "no_words" };
  }

  const summary = formatWordSummary(entry);
  if (!dryRun) {
    const api = await getBotApi();
    await api.sendMessage(ownerId, formatWordLesson(entry), {
      parse_mode: "HTML",
    });
  }

  return { ok: true, dryRun, skipped: false, summary, chatId: ownerId };
}

export async function runReminderCron(
  options: {
    dryRun?: boolean;
  } = {},
): Promise<CronJobResult> {
  const dryRun = options.dryRun ?? false;
  if (dryRun) {
    const due = await listDueReminders();
    if (due.length === 0) {
      return { ok: true, dryRun, skipped: true, reason: "none_due", sentCount: 0 };
    }
    return { ok: true, dryRun, skipped: false, sentCount: due.length };
  }

  const claimed = await claimDueReminders();

  if (claimed.length === 0) {
    return { ok: true, dryRun, skipped: true, reason: "none_due", sentCount: 0 };
  }

  if (!dryRun) {
    const api = await getBotApi();
    for (const reminder of claimed) {
      const keyboard = reminderDoneKeyboard(reminder);
      await api.sendMessage(
        reminder.target_chat_id,
        formatReminderMessage(reminder),
        {
          parse_mode: "HTML",
          ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
        },
      );
    }
  }

  return {
    ok: true,
    dryRun,
    skipped: false,
    sentCount: claimed.length,
  };
}
