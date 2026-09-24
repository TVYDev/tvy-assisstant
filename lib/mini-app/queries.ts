import { version } from "../../package.json";
import { getTodaysLessonWord } from "../daily-word";
import { getWordRecipients } from "../word-recipients";
import { getCommandFollowupStickerConfig } from "../command-followup-stickers";
import {
  getDebtByShortcode,
  type DebtItem,
} from "../debt";
import {
  getDepositBalanceByShortcode,
  getDepositTransactions,
  type DepositTransaction,
} from "../deposit";
import {
  FITNESS_HISTORY_GRID_WEEKS,
  getLogForDate,
  getLogHistory,
  isGymMotivationReminderEnabled,
  todayInPhnomPenh,
  type DailyFitnessLog,
} from "../fitness-log";
import { getOweSnapshot, getOweSnapshotForShortcode } from "../owe-message";
import {
  getAlloweSnapshot,
  getLedgerRows,
  type LedgerRow,
} from "../owner-replies";
import { listPendingReminders, type ReminderRecord } from "../reminders";
import { getKnownShortcodes } from "../shortcode-prompt";
import {
  getTodos,
  listTodoLists,
  type TodoListFilter,
  type TodoListRecord,
  type TodoListResult,
  type TodoRecord,
} from "../todos";
import {
  getCurrentYoutubeMonthlyFee,
  getYoutubeFeeSchedules,
  resolveFeeForMonth,
  type YoutubeFeeSchedule,
} from "../youtube-fee";
import {
  getAllTelegramUsers,
  getYouTubeMonthsForShortcode,
  type TelegramUserRow,
} from "../youtube-subscription";
import type { MiniAppSession } from "./auth";

export type SessionPayload = MiniAppSession & { version: string };

export function sessionPayload(session: MiniAppSession): SessionPayload {
  return { ...session, version };
}

export async function getHomePayload(session: MiniAppSession) {
  if (session.isOwner) {
    const [allowe, fitness, todos, reminders, lesson] = await Promise.all([
      getAlloweSnapshot(),
      getLogForDate(todayInPhnomPenh()),
      getTodos("today"),
      listPendingReminders(),
      getTodaysLessonWord(),
    ]);
    return {
      kind: "owner" as const,
      wordOfTheDay: lesson
        ? {
            word: lesson.word,
            definition: lesson.definition,
            pronounciationRegion: lesson.pronounciationRegion,
            pronounciation: lesson.pronounciation,
            hasAudio: lesson.hasAudio,
          }
        : null,
      allowe,
      fitness,
      todayTodos: {
        open: todos.open,
        doneToday: todos.doneToday,
      },
      remindersDueSoon: reminders.slice(0, 3) as ReminderRecord[],
      reminderCount: reminders.length,
    };
  }

  return {
    kind: "user" as const,
    snapshot: await getOweSnapshot(
      session.user.id,
      session.user.username,
      session.user.firstName,
    ),
  };
}

export type PersonLedger = {
  shortcode: string;
  user: TelegramUserRow | null;
  items: DebtItem[];
  iOwe: number;
  owesMe: number;
  deposit: number;
  depositHistory: DepositTransaction[];
  youtubeMonths: Array<{
    id: number;
    month: string;
    paid: boolean;
    fee: number;
  }>;
  snapshot: Awaited<ReturnType<typeof getOweSnapshotForShortcode>>;
};

export async function getPeoplePayload(): Promise<{
  people: Array<TelegramUserRow & { ledger: LedgerRow | null }>;
}> {
  const [users, rows] = await Promise.all([
    getAllTelegramUsers(),
    getLedgerRows(),
  ]);
  const byCode = new Map(rows.map((row) => [row.shortcode, row]));
  return {
    people: users
      .map((user) => ({
        ...user,
        ledger: user.shortcode ? (byCode.get(user.shortcode) ?? null) : null,
      }))
      .sort((a, b) => (b.ledger?.netTotal ?? 0) - (a.ledger?.netTotal ?? 0)),
  };
}

export async function getPersonLedger(shortcode: string): Promise<PersonLedger> {
  const code = shortcode.toUpperCase();
  const [users, record, deposit, depositHistory, ytMonths, schedules, snapshot] =
    await Promise.all([
      getAllTelegramUsers(),
      getDebtByShortcode(code),
      getDepositBalanceByShortcode(code),
      getDepositTransactions(code),
      getYouTubeMonthsForShortcode(code),
      getYoutubeFeeSchedules(),
      getOweSnapshotForShortcode(code),
    ]);

  const user = users.find((row) => row.shortcode === code) ?? null;

  return {
    shortcode: code,
    user,
    items: record?.items ?? [],
    iOwe: record?.i_owe ?? 0,
    owesMe: record?.owes_me ?? 0,
    deposit,
    depositHistory,
    youtubeMonths: ytMonths.map((month) => ({
      id: month.id,
      month: month.month,
      paid: month.paid,
      fee: resolveFeeForMonth(schedules, month.month),
    })),
    snapshot,
  };
}

export async function getFitnessPayload(): Promise<{
  today: string;
  log: DailyFitnessLog | null;
  history: DailyFitnessLog[];
  weeks: number;
  gymReminderEnabled: boolean;
}> {
  const today = todayInPhnomPenh();
  const [log, history, gymReminderEnabled] = await Promise.all([
    getLogForDate(today),
    getLogHistory(),
    isGymMotivationReminderEnabled(),
  ]);
  return {
    today,
    log,
    history,
    weeks: FITNESS_HISTORY_GRID_WEEKS,
    gymReminderEnabled,
  };
}

export async function getTasksPayload(filter: TodoListFilter = "today"): Promise<{
  lists: Array<TodoListRecord & { open_count: number }>;
  todos: TodoListResult;
  reminders: ReminderRecord[];
}> {
  const [lists, todos, reminders] = await Promise.all([
    listTodoLists(),
    getTodos(filter),
    listPendingReminders(),
  ]);
  return { lists, todos, reminders };
}

export async function getMorePayload(): Promise<{
  users: TelegramUserRow[];
  fees: YoutubeFeeSchedule[];
  currentFee: number;
  stickers: Awaited<ReturnType<typeof getCommandFollowupStickerConfig>>;
  shortcodes: string[];
  wordRecipients: Awaited<ReturnType<typeof getWordRecipients>>;
}> {
  const [users, fees, stickers, shortcodes, wordRecipients] = await Promise.all([
    getAllTelegramUsers(),
    getYoutubeFeeSchedules(),
    getCommandFollowupStickerConfig(),
    getKnownShortcodes(),
    getWordRecipients(),
  ]);
  let currentFee = 0;
  try {
    currentFee = await getCurrentYoutubeMonthlyFee();
  } catch {
    currentFee = 0;
  }
  return { users, fees, currentFee, stickers, shortcodes, wordRecipients };
}

export type { TodoRecord };
