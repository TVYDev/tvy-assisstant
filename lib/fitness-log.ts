import { supabase } from "./supabase";
import { getConfig, setConfig } from "./youtube-subscription";

const TIMEZONE = "Asia/Phnom_Penh";
const SESSION_TTL_MS = 30 * 60 * 1000;
export const FITNESS_HISTORY_GRID_DAYS = 90;
export const FITNESS_HISTORY_RECENT_DAYS = 7;

export const GYM_SESSIONS = [
  "chest",
  "shoulder",
  "back",
  "triceps",
  "biceps",
  "legs",
  "cardio",
] as const;

export type GymSession = (typeof GYM_SESSIONS)[number];
export type GymStatus = "gym" | "rest" | "skip";
export type SessionStep = "weight" | "gym" | "session" | "minutes";

export type FitnessLogKeyboardButton = {
  text: string;
  callback_data: string;
};

export type FitnessLogKeyboard = FitnessLogKeyboardButton[][];

export const FITNESS_LOG_CALLBACK_PREFIX = "fl";
export const FITNESS_LOG_MINUTE_PRESETS = [30, 45, 60] as const;

export interface DailyFitnessLog {
  id: number;
  log_date: string;
  weight_kg: number;
  gym_status: GymStatus;
  gym_session: string | null;
  gym_minutes: number | null;
}

export interface FitnessLogSession {
  telegram_user_id: number;
  step: SessionStep;
  weight_kg: number | null;
  gym_session: string | null;
  target_log_date: string | null;
  expires_at: string;
}

export interface AdvanceSessionResult {
  reply: string;
  done: boolean;
  keyboard?: FitnessLogKeyboard;
}

export function todayInPhnomPenh(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function parseLogDateInput(input: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;

  const [y, m, d] = input.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return input;
}

export function validateLogDate(
  logDate: string,
  today: string = todayInPhnomPenh(),
): string | null {
  if (logDate > today) return "Log date cannot be in the future.";
  const oldest = addDaysToDateString(today, -364);
  if (logDate < oldest) return "Log date cannot be more than 365 days ago.";
  return null;
}

export function splitFitCommandArgs(
  args: string,
  today: string = todayInPhnomPenh(),
):
  | { ok: true; logDate: string; rest: string }
  | { ok: false; error: string } {
  const trimmed = args.trim();
  if (!trimmed) {
    return { ok: true, logDate: today, rest: "" };
  }

  const parts = trimmed.split(/\s+/);
  const maybeDate = parseLogDateInput(parts[0]);
  if (maybeDate) {
    const dateError = validateLogDate(maybeDate, today);
    if (dateError) return { ok: false, error: dateError };
    return {
      ok: true,
      logDate: maybeDate,
      rest: parts.slice(1).join(" "),
    };
  }

  return { ok: true, logDate: today, rest: trimmed };
}

function sessionLogDate(session: FitnessLogSession): string {
  return session.target_log_date ?? todayInPhnomPenh();
}

function dayOfWeekSundayZero(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dayOfWeekMondayZero(dateStr: string): number {
  const sundayZero = dayOfWeekSundayZero(dateStr);
  return sundayZero === 0 ? 6 : sundayZero - 1;
}

export type GymDayStatus = GymStatus;

export function buildGymActivityMap(
  logs: DailyFitnessLog[],
): Map<string, GymDayStatus> {
  const map = new Map<string, GymDayStatus>();
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  for (const log of sorted) {
    const gymDate = addDaysToDateString(log.log_date, -1);
    map.set(gymDate, log.gym_status);
  }
  return map;
}

const GRID_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const GRID_GYM = "🟩";
const GRID_REST = "⬜";
const GRID_SKIP = "🟧";
const GRID_UNKNOWN = "⬛";
const GRID_OUTSIDE = "▫️";

function statusToGridCell(
  dateStr: string,
  startDate: string,
  endDate: string,
  activityMap: Map<string, GymDayStatus>,
): string {
  if (dateStr < startDate || dateStr > endDate) return GRID_OUTSIDE;
  const status = activityMap.get(dateStr);
  if (status === "gym") return GRID_GYM;
  if (status === "rest") return GRID_REST;
  if (status === "skip") return GRID_SKIP;
  return GRID_UNKNOWN;
}

export function buildGymActivityGridMatrix(
  logs: DailyFitnessLog[],
  days: number,
  today: string = todayInPhnomPenh(),
): string[][] {
  const safeDays = Math.min(Math.max(Math.floor(days), 7), 365);
  const activityMap = buildGymActivityMap(logs);
  const endDate = addDaysToDateString(today, -1);
  const startDate = addDaysToDateString(endDate, -(safeDays - 1));

  const gridStart = addDaysToDateString(
    startDate,
    -dayOfWeekMondayZero(startDate),
  );
  const gridEnd = addDaysToDateString(
    endDate,
    6 - dayOfWeekMondayZero(endDate),
  );

  const columns: string[][] = [];
  let weekStart = gridStart;
  while (weekStart <= gridEnd) {
    const column: string[] = [];
    for (let dow = 0; dow < 7; dow++) {
      column.push(
        statusToGridCell(
          addDaysToDateString(weekStart, dow),
          startDate,
          endDate,
          activityMap,
        ),
      );
    }
    columns.push(column);
    weekStart = addDaysToDateString(weekStart, 7);
  }

  return GRID_DAY_LABELS.map((_label, row) =>
    columns.map((column) => column[row]),
  );
}

export function formatGymActivityGrid(
  logs: DailyFitnessLog[],
  days: number,
  today: string = todayInPhnomPenh(),
): string {
  const safeDays = Math.min(Math.max(Math.floor(days), 7), 365);
  const activityMap = buildGymActivityMap(logs);
  const endDate = addDaysToDateString(today, -1);
  const startDate = addDaysToDateString(endDate, -(safeDays - 1));
  const matrix = buildGymActivityGridMatrix(logs, days, today);

  let gymCount = 0;
  let restCount = 0;
  let skipCount = 0;
  let unknownCount = 0;
  for (let i = 0; i < safeDays; i++) {
    const dateStr = addDaysToDateString(startDate, i);
    const status = activityMap.get(dateStr);
    if (status === "gym") gymCount++;
    else if (status === "rest") restCount++;
    else if (status === "skip") skipCount++;
    else unknownCount++;
  }

  const gridLines = GRID_DAY_LABELS.map((label, row) => {
    const cells = matrix[row].join("");
    return `${label} ${cells}`;
  });

  return (
    `🏋️ Gym activity (last ${safeDays} days)\n` +
    `${GRID_GYM} gym  ${GRID_REST} rest  ${GRID_SKIP} skip  ${GRID_UNKNOWN} no log\n` +
    `Gym ${gymCount} · Rest ${restCount} · Skip ${skipCount} · No log ${unknownCount}\n\n` +
    `<pre>${gridLines.join("\n")}</pre>`
  );
}

export function parseWeightKg(input: string): number | null {
  const value = parseFloat(input.trim().replace(",", "."));
  if (Number.isNaN(value) || value <= 0 || value >= 500) return null;
  return Math.round(value * 100) / 100;
}

export function parseGymOutcome(input: string): GymStatus | null {
  const normalized = input.trim().toLowerCase();
  if (["yes", "y", "true", "1", "gym"].includes(normalized)) return "gym";
  if (["rest", "rest day", "restday"].includes(normalized)) return "rest";
  if (["skip", "skipped"].includes(normalized)) return "skip";
  return null;
}

export function parseYesNo(input: string): boolean | null {
  const outcome = parseGymOutcome(input);
  if (outcome === "gym") return true;
  if (outcome === "rest" || outcome === "skip") return false;
  return null;
}

export function parseGymSession(input: string): GymSession | null {
  const parsed = parseGymSessionInput(input);
  if (!parsed) return null;
  return GYM_SESSIONS.includes(parsed as GymSession)
    ? (parsed as GymSession)
    : null;
}

export function parseGymSessionInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 50) return null;

  const normalized = trimmed.toLowerCase();
  if (GYM_SESSIONS.includes(normalized as GymSession)) {
    return normalized;
  }

  return trimmed;
}

export function buildGymKeyboard(): FitnessLogKeyboard {
  return [
    [{ text: "Yes", callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:g:yes` }],
    [
      { text: "Rest day", callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:g:rest` },
      { text: "Skip", callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:g:skip` },
    ],
  ];
}

export function buildSessionKeyboard(): FitnessLogKeyboard {
  return [
    GYM_SESSIONS.slice(0, 3).map((session) => ({
      text: session.charAt(0).toUpperCase() + session.slice(1),
      callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:s:${session}`,
    })),
    GYM_SESSIONS.slice(3, 6).map((session) => ({
      text: session.charAt(0).toUpperCase() + session.slice(1),
      callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:s:${session}`,
    })),
    [
      {
        text: "Cardio",
        callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:s:cardio`,
      },
    ],
  ];
}

export function buildMinutesKeyboard(): FitnessLogKeyboard {
  return [
    FITNESS_LOG_MINUTE_PRESETS.map((minutes) => ({
      text: `${minutes} min`,
      callback_data: `${FITNESS_LOG_CALLBACK_PREFIX}:m:${minutes}`,
    })),
  ];
}

export function parseFitnessLogCallback(data: string): string | null {
  if (!data.startsWith(`${FITNESS_LOG_CALLBACK_PREFIX}:`)) return null;

  const [, kind, value] = data.split(":");
  if (!kind || value === undefined) return null;

  switch (kind) {
    case "g":
      if (value === "yes") return "yes";
      if (value === "rest") return "rest";
      if (value === "skip") return "skip";
      return null;
    case "s":
      return parseGymSessionInput(value);
    case "m": {
      const minutes = parseInt(value, 10);
      if (Number.isNaN(minutes)) return null;
      return String(minutes);
    }
    default:
      return null;
  }
}

function stepPrompt(
  step: Exclude<SessionStep, "weight">,
): Pick<AdvanceSessionResult, "reply" | "keyboard"> {
  switch (step) {
    case "gym":
      return {
        reply: "Did you gym yesterday?",
        keyboard: buildGymKeyboard(),
      };
    case "session":
      return {
        reply:
          "Which session did you do?\n" +
          "Tap a button or type your own (e.g. full body).",
        keyboard: buildSessionKeyboard(),
      };
    case "minutes":
      return {
        reply: "How many minutes did you gym?\nTap a button or type a number.",
        keyboard: buildMinutesKeyboard(),
      };
  }
}

export function parseGymMinutes(input: string): number | null {
  const value = parseInt(input.trim(), 10);
  if (Number.isNaN(value) || value <= 0 || value > 600) return null;
  return value;
}

export type QuickLogInput =
  | {
      ok: true;
      log_date: string;
      weight_kg: number;
      gym_status: GymStatus;
      gym_session: string | null;
      gym_minutes: number | null;
    }
  | { ok: false; error: string };

export const QUICK_LOG_USAGE =
  "Usage:\n" +
  "/fit — guided step-by-step (today)\n" +
  "/fit YYYY-MM-DD — guided backdate\n" +
  "/fit <weight> rest|skip\n" +
  "/fit <weight> yes <session> <minutes>\n" +
  "/fit YYYY-MM-DD <weight> rest|skip|yes ...\n\n" +
  "Examples:\n" +
  "/fit 75.5 rest\n" +
  "/fit 2026-06-12 75.5 skip\n" +
  "/fit 2026-06-12 75.5 yes chest 45";

export function parseQuickLogInput(
  args: string,
  today: string = todayInPhnomPenh(),
): QuickLogInput {
  const split = splitFitCommandArgs(args, today);
  if (!split.ok) return { ok: false, error: split.error };

  const { logDate, rest } = split;
  if (!rest) {
    return {
      ok: false,
      error: "Quick logs need weight and gym status.\n" + QUICK_LOG_USAGE,
    };
  }

  const parts = rest.split(/\s+/);
  if (parts.length < 2) {
    return { ok: false, error: QUICK_LOG_USAGE };
  }

  const weight = parseWeightKg(parts[0]);
  if (weight === null) {
    return { ok: false, error: "Weight must be a valid number in kg (e.g. 75.5)." };
  }

  const outcome = parseGymOutcome(parts[1]);
  if (outcome === null) {
    return {
      ok: false,
      error:
        "Second argument must be yes, rest, or skip.\nExample: /fit 75.5 rest",
    };
  }

  if (outcome === "rest" || outcome === "skip") {
    if (parts.length > 2) {
      return {
        ok: false,
        error: `Use only weight and ${outcome}.\nExample: /fit 75.5 ${outcome}`,
      };
    }
    return {
      ok: true,
      log_date: logDate,
      weight_kg: weight,
      gym_status: outcome,
      gym_session: null,
      gym_minutes: null,
    };
  }

  if (parts.length < 4) {
    return {
      ok: false,
      error:
        "Gym days need session and minutes.\nExample: /fit 75.5 yes chest 45",
    };
  }

  const minutes = parseGymMinutes(parts[parts.length - 1]);
  if (minutes === null) {
    return {
      ok: false,
      error: "Minutes must be a number between 1 and 600.",
    };
  }

  const session = parseGymSessionInput(parts.slice(2, -1).join(" "));
  if (session === null) {
    return {
      ok: false,
      error: "Session must be 1–50 characters.\nExample: /fit 75.5 yes chest 45",
    };
  }

  return {
    ok: true,
    log_date: logDate,
    weight_kg: weight,
    gym_status: "gym",
    gym_session: session,
    gym_minutes: minutes,
  };
}

export async function submitQuickLog(
  telegramUserId: number,
  args: string,
): Promise<AdvanceSessionResult> {
  const parsed = parseQuickLogInput(args);
  if (!parsed.ok) {
    return { reply: parsed.error, done: false };
  }

  return saveAndConfirm(telegramUserId, {
    log_date: parsed.log_date,
    weight_kg: parsed.weight_kg,
    gym_status: parsed.gym_status,
    gym_session: parsed.gym_session,
    gym_minutes: parsed.gym_minutes,
  });
}

function sessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

function isSessionExpired(session: FitnessLogSession): boolean {
  return new Date(session.expires_at).getTime() <= Date.now();
}

export async function getLogForDate(
  logDate: string,
): Promise<DailyFitnessLog | null> {
  const { data, error } = await supabase
    .from("daily_fitness_logs")
    .select("*")
    .eq("log_date", logDate)
    .maybeSingle();

  if (error) throw new Error(`Failed to get fitness log: ${error.message}`);
  return data as DailyFitnessLog | null;
}

export async function upsertDailyLog(log: {
  log_date: string;
  weight_kg: number;
  gym_status: GymStatus;
  gym_session: string | null;
  gym_minutes: number | null;
}): Promise<DailyFitnessLog> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("daily_fitness_logs")
    .upsert(
      {
        log_date: log.log_date,
        weight_kg: log.weight_kg,
        gym_status: log.gym_status,
        gym_session: log.gym_session,
        gym_minutes: log.gym_minutes,
        updated_at: now,
      },
      { onConflict: "log_date" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save fitness log: ${error.message}`);
  return data as DailyFitnessLog;
}

export async function getLogHistory(days: number): Promise<DailyFitnessLog[]> {
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 365);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (safeDays - 1));
  const start = todayInPhnomPenh(startDate);

  const { data, error } = await supabase
    .from("daily_fitness_logs")
    .select("*")
    .gte("log_date", start)
    .order("log_date", { ascending: false });

  if (error) throw new Error(`Failed to get fitness history: ${error.message}`);
  return (data ?? []) as DailyFitnessLog[];
}

export async function getSession(
  telegramUserId: number,
): Promise<FitnessLogSession | null> {
  const { data, error } = await supabase
    .from("fitness_log_sessions")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get log session: ${error.message}`);
  if (!data) return null;

  const session = data as FitnessLogSession;
  if (isSessionExpired(session)) {
    await cancelSession(telegramUserId);
    return null;
  }

  return session;
}

export async function startSession(
  telegramUserId: number,
  targetLogDate?: string,
): Promise<{ reply: string }> {
  const logDate = targetLogDate ?? todayInPhnomPenh();
  const dateError = validateLogDate(logDate);
  if (dateError) return { reply: dateError };

  const now = new Date().toISOString();
  const { error } = await supabase.from("fitness_log_sessions").upsert(
    {
      telegram_user_id: telegramUserId,
      step: "weight",
      weight_kg: null,
      gym_session: null,
      target_log_date: logDate,
      expires_at: sessionExpiryIso(),
      updated_at: now,
    },
    { onConflict: "telegram_user_id" },
  );

  if (error) throw new Error(`Failed to start log session: ${error.message}`);

  const backdateNote =
    logDate !== todayInPhnomPenh()
      ? `Logging for ${logDate} (backdate)\n\n`
      : "";

  return {
    reply:
      "📝 Morning log time!\n\n" +
      backdateNote +
      "What's your weight that day? (kg)\n" +
      "Example: 75.5\n\n" +
      "Or log everything at once:\n" +
      `/fit ${logDate} 75.5 rest\n` +
      `/fit ${logDate} 75.5 skip\n` +
      `/fit ${logDate} 75.5 yes chest 45`,
  };
}

export async function cancelSession(telegramUserId: number): Promise<void> {
  const { error } = await supabase
    .from("fitness_log_sessions")
    .delete()
    .eq("telegram_user_id", telegramUserId);

  if (error) throw new Error(`Failed to cancel log session: ${error.message}`);
}

async function updateSession(
  telegramUserId: number,
  patch: Partial<FitnessLogSession>,
): Promise<void> {
  const { error } = await supabase
    .from("fitness_log_sessions")
    .update({
      ...patch,
      expires_at: sessionExpiryIso(),
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_user_id", telegramUserId);

  if (error) throw new Error(`Failed to update log session: ${error.message}`);
}

async function saveAndConfirm(
  telegramUserId: number,
  log: {
    log_date: string;
    weight_kg: number;
    gym_status: GymStatus;
    gym_session: string | null;
    gym_minutes: number | null;
  },
): Promise<AdvanceSessionResult> {
  const dateError = validateLogDate(log.log_date);
  if (dateError) return { reply: dateError, done: false };

  const existing = await getLogForDate(log.log_date);
  const saved = await upsertDailyLog(log);
  await cancelSession(telegramUserId);
  return {
    reply: formatLogConfirmation(saved, !!existing),
    done: true,
  };
}

async function completeSession(
  telegramUserId: number,
  session: FitnessLogSession,
  gymMinutes: number,
): Promise<AdvanceSessionResult> {
  return saveAndConfirm(telegramUserId, {
    log_date: sessionLogDate(session),
    weight_kg: session.weight_kg!,
    gym_status: "gym",
    gym_session: session.gym_session!,
    gym_minutes: gymMinutes,
  });
}

export async function advanceSession(
  telegramUserId: number,
  input: string,
): Promise<AdvanceSessionResult> {
  const session = await getSession(telegramUserId);
  if (!session) {
    return {
      reply: "No active log session. Send /fit to start.",
      done: false,
    };
  }

  switch (session.step) {
    case "weight": {
      const weight = parseWeightKg(input);
      if (weight === null) {
        return {
          reply: "Please enter a valid weight in kg (e.g. 75.5).",
          done: false,
        };
      }
      await updateSession(telegramUserId, { step: "gym", weight_kg: weight });
      return { done: false, ...stepPrompt("gym") };
    }
    case "gym": {
      const outcome = parseGymOutcome(input);
      if (outcome === null) {
        return {
          reply: "Please tap a button or reply with yes, rest, or skip.",
          done: false,
          keyboard: buildGymKeyboard(),
        };
      }
      if (outcome === "rest" || outcome === "skip") {
        return saveAndConfirm(telegramUserId, {
          log_date: sessionLogDate(session),
          weight_kg: session.weight_kg!,
          gym_status: outcome,
          gym_session: null,
          gym_minutes: null,
        });
      }
      await updateSession(telegramUserId, {
        step: "session",
      });
      return { done: false, ...stepPrompt("session") };
    }
    case "session": {
      const gymSession = parseGymSessionInput(input);
      if (gymSession === null) {
        return {
          reply: "Please tap a button or type a session name (max 50 chars).",
          done: false,
          keyboard: buildSessionKeyboard(),
        };
      }
      await updateSession(telegramUserId, {
        step: "minutes",
        gym_session: gymSession,
      });
      return { done: false, ...stepPrompt("minutes") };
    }
    case "minutes": {
      const minutes = parseGymMinutes(input);
      if (minutes === null) {
        return {
          reply: "Please tap a button or enter a valid number of minutes (1–600).",
          done: false,
          keyboard: buildMinutesKeyboard(),
        };
      }
      return completeSession(telegramUserId, session, minutes);
    }
    default:
      return {
        reply: "Something went wrong. Send /fit to start over.",
        done: false,
      };
  }
}

export function formatWeightKg(weightKg: number): string {
  return `${weightKg.toFixed(2)} kg`;
}

export function formatGymSummary(
  log: Pick<DailyFitnessLog, "gym_status" | "gym_session" | "gym_minutes">,
): string {
  if (log.gym_status === "gym") {
    return `${log.gym_minutes} min ${log.gym_session}`;
  }
  if (log.gym_status === "rest") return "rest day";
  return "skip";
}

export function formatLogHistoryLine(log: DailyFitnessLog): string {
  return `${log.log_date} — ${formatWeightKg(log.weight_kg)} | ${formatGymSummary(log)}`;
}

export function formatLogConfirmation(
  log: DailyFitnessLog,
  updated: boolean,
  today: string = todayInPhnomPenh(),
): string {
  const prefix = updated
    ? `✅ Updated log for ${log.log_date}!`
    : log.log_date === today
      ? "✅ Logged for today!"
      : `✅ Logged for ${log.log_date}!`;

  return (
    `${prefix}\n` +
    `📅 ${log.log_date}\n` +
    `⚖️ ${formatWeightKg(log.weight_kg)}\n` +
    `🏋️ Yesterday: ${formatGymSummary(log)}`
  );
}

export function formatLogHistory(
  logs: DailyFitnessLog[],
  gridDays: number = FITNESS_HISTORY_GRID_DAYS,
  today: string = todayInPhnomPenh(),
  recentDays: number = FITNESS_HISTORY_RECENT_DAYS,
): string {
  if (logs.length === 0) {
    return `📊 No fitness logs in the last ${gridDays} days.`;
  }

  const grid = formatGymActivityGrid(logs, gridDays, today);
  const recentStart = addDaysToDateString(today, -(recentDays - 1));
  const recentLines = logs
    .filter((log) => log.log_date >= recentStart)
    .map(formatLogHistoryLine);

  const recentSection =
    recentLines.length > 0
      ? recentLines.join("\n")
      : `No logs in the last ${recentDays} days.`;

  return `${grid}\n\n📝 Recent logs (last ${recentDays} days)\n${recentSection}`;
}

export function buildMorningReminderMessage(): string {
  return (
    "🌅 Good morning boss!\n\n" +
    "Time to log your weight and yesterday's gym session.\n" +
    "Send /fit for step-by-step, or:\n" +
    "/fit 75.5 rest\n" +
    "/fit 2026-06-12 75.5 yes chest 45 🦕"
  );
}

export const GYM_MOTIVATION_CONFIG_KEY = "gym_motivation_reminder_enabled";

const GYM_MOTIVATION_MSGS = [
  "🦕 4:45 PM energy check! The gym is calling, boss. Go answer it! 💪",
  "🏋️ Dino believes in you! One session today = one step closer to legendary. Let's go!",
  "⏰ It's gym o'clock! Your future self will thank you. I will too. 🦖",
  "🔥 Weekday grind time! Skip the couch, hit the weights. Dino is cheering!",
  "💪 Boss mode activated? Prove it at the gym tonight. I know you've got this!",
  "🦕 Round belly? Not forever! Go gym and make Dino proud today!",
  "🚀 Consistency beats motivation — but here's motivation anyway: GO GYM!",
  "🏆 Champions show up on weekdays. You're a champion, right? Right?? 🦕",
];

function pickMotivationMessage<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function isWeekdayInPhnomPenh(date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
  }).format(date);
  return weekday !== "Sat" && weekday !== "Sun";
}

export function parseGymMotivationReminderEnabled(
  value: string,
): boolean {
  return value.trim().toLowerCase() === "true";
}

export async function isGymMotivationReminderEnabled(): Promise<boolean> {
  const value = await getConfig(GYM_MOTIVATION_CONFIG_KEY);
  return parseGymMotivationReminderEnabled(value);
}

export async function setGymMotivationReminderEnabled(
  enabled: boolean,
): Promise<void> {
  await setConfig(
    GYM_MOTIVATION_CONFIG_KEY,
    enabled ? "true" : "false",
  );
}

export function buildGymMotivationMessage(): string {
  return pickMotivationMessage(GYM_MOTIVATION_MSGS);
}

export function formatGymMotivationReminderStatus(enabled: boolean): string {
  return enabled
    ? "🔔 Weekday gym motivation reminder is ON (4:45 PM Mon–Fri)."
    : "🔕 Weekday gym motivation reminder is OFF.";
}
