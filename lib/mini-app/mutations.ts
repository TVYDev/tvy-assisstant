import {
  parseConfigurableCommandKey,
  updateCommandFollowupStickerRule,
  type CommandFollowupStickerRule,
} from "../command-followup-stickers";
import {
  addDebt,
  cancelDebtItem,
  getDebtByShortcode,
  markAllPaid,
  toggleDebtItemPaid,
  updateDebtItem,
} from "../debt";
import { addDeposit, reduceDeposit } from "../deposit";
import {
  parseGymMinutes,
  parseGymSessionInput,
  parseWeightKg,
  setGymMotivationReminderEnabled,
  todayInPhnomPenh,
  upsertDailyLog,
  validateLogDate,
  type GymStatus,
} from "../fitness-log";
import {
  formatCronJobReply,
  runFitnessReminderCron,
  runGymMotivationCron,
  runRandomWordCron,
  runReminderCron,
  runWordOfTheDayCron,
  runYoutubeReminderCron,
} from "../cron-jobs";
import {
  parsePaymentTail,
  settlePayment,
  type PaymentSettlementMode,
} from "../payment-settlement";
import { addReminder, cancelReminder } from "../reminders";
import { combineDateAndClock, type Recurrence } from "../reminder-time";
import {
  addTodo,
  cancelTodo,
  createList,
  deleteList,
  moveTodo,
  searchTodos,
  setTodoDone,
} from "../todos";
import { addYoutubeFeeSchedule, getUnpaidYoutubeOwing } from "../youtube-fee";
import {
  bulkToggleYouTubeMonthsPaid,
  markYouTubePaid,
  toggleAllYouTubeMonthsPaid,
  toggleYouTubeMonthPaid,
  updateTelegramUserField,
} from "../youtube-subscription";
import { MiniAppError } from "./errors";

export type SettleInput = {
  mode: PaymentSettlementMode;
  received?: number;
};

function settlementTail(input: SettleInput) {
  if (input.mode === "use_deposit") return parsePaymentTail(["deposit"]).tail;
  if (input.mode === "received_cash") {
    const received = input.received ?? 0;
    if (received <= 0) {
      throw new MiniAppError("Received amount must be a positive number.");
    }
    return parsePaymentTail([String(received)]).tail;
  }
  return parsePaymentTail([]).tail;
}

async function notifyYoutubeGroup(message: string): Promise<void> {
  const chatId = process.env.YOUTUBE_GROUP_CHAT_ID;
  if (!chatId) return;
  const { bot } = await import("../bot");
  await bot.api.sendMessage(chatId, message);
}

export async function ownerAddDebt(input: {
  shortcode: string;
  amount: number;
  description: string;
}): Promise<void> {
  if (!input.description.trim()) {
    throw new MiniAppError("Description is required.");
  }
  if (!(input.amount > 0)) {
    throw new MiniAppError("Amount must be a positive number.");
  }
  await addDebt(input.shortcode, input.amount, input.description.trim());
}

export async function ownerUpdateDebt(input: {
  itemId: number;
  amount: number;
  description: string;
}): Promise<void> {
  if (!input.description.trim()) {
    throw new MiniAppError("Description is required.");
  }
  if (!(input.amount > 0)) {
    throw new MiniAppError("Amount must be a positive number.");
  }
  const result = await updateDebtItem(
    input.itemId,
    input.amount,
    input.description.trim(),
  );
  if (!result) throw new MiniAppError("Debt item not found.");
}

export async function ownerCancelDebt(itemId: number): Promise<void> {
  const result = await cancelDebtItem(itemId);
  if (!result) throw new MiniAppError("Debt item not found.");
}

export async function ownerToggleDebtPaid(input: {
  itemId: number;
  paid: boolean;
  settle?: SettleInput;
}): Promise<void> {
  const result = await toggleDebtItemPaid(input.itemId, input.paid);
  if (!result) throw new MiniAppError("Debt item not found.");
  if (input.paid && result.newlyPaid && input.settle) {
    await settlePayment(
      result.shortcode,
      result.amount,
      settlementTail(input.settle),
      `Debt #${input.itemId} paid`,
    );
  }
}

export async function ownerPayAll(input: {
  shortcode: string;
  settle: SettleInput;
}): Promise<void> {
  const code = input.shortcode.toUpperCase();
  const [record, ytOwing] = await Promise.all([
    getDebtByShortcode(code),
    getUnpaidYoutubeOwing(code),
  ]);
  const unpaidDebt = record
    ? record.items.filter((item) => !item.paid).reduce((sum, item) => sum + item.amount, 0)
    : 0;
  await Promise.all([markAllPaid(code), markYouTubePaid(code)]);
  await settlePayment(
    code,
    unpaidDebt + ytOwing.total,
    settlementTail(input.settle),
    `Paid: cleared all debts and YouTube for ${code}`,
  );
}

export async function ownerAddDeposit(input: {
  shortcode: string;
  amount: number;
  note?: string;
}): Promise<number> {
  if (!(input.amount > 0)) {
    throw new MiniAppError("Amount must be a positive number.");
  }
  return addDeposit(input.shortcode, input.amount, input.note);
}

export async function ownerReduceDeposit(input: {
  shortcode: string;
  amount: number;
  note?: string;
}): Promise<number> {
  if (!(input.amount > 0)) {
    throw new MiniAppError("Amount must be a positive number.");
  }
  return reduceDeposit(input.shortcode, input.amount, input.note);
}

export async function ownerToggleYoutubeMonth(input: {
  shortcode: string;
  month: string;
  paid: boolean;
  settle?: SettleInput;
}): Promise<void> {
  const code = input.shortcode.toUpperCase();
  const month = input.month.slice(0, 7);
  const owing = input.paid ? await getUnpaidYoutubeOwing(code, [month]) : { total: 0 };
  const result = await toggleYouTubeMonthPaid(code, month, input.paid);
  if (!result) {
    throw new MiniAppError(`No YouTube month found for ${code} ${month}.`);
  }
  if (input.paid && input.settle) {
    await settlePayment(
      code,
      owing.total,
      settlementTail(input.settle),
      `YouTube ${month}`,
    );
  }
  await notifyYoutubeGroup(
    input.paid
      ? `✅ ${code} YouTube ${month} marked paid`
      : `⏳ ${code} YouTube ${month} marked unpaid`,
  );
}

export async function ownerToggleAllYoutube(input: {
  shortcode: string;
  paid: boolean;
  settle?: SettleInput;
}): Promise<void> {
  const code = input.shortcode.toUpperCase();
  const owing = input.paid ? await getUnpaidYoutubeOwing(code) : { total: 0 };
  const changed = await toggleAllYouTubeMonthsPaid(code, input.paid);
  if (input.paid && input.settle) {
    await settlePayment(
      code,
      owing.total,
      settlementTail(input.settle),
      `YouTube all months`,
    );
  }
  const months = changed.map((row) => row.month.slice(0, 7));
  if (months.length > 0) {
    await notifyYoutubeGroup(
      input.paid
        ? `✅ ${code} YouTube ${months.join(", ")} marked paid`
        : `⏳ ${code} YouTube ${months.join(", ")} marked unpaid`,
    );
  }
}

export async function ownerBulkYoutubeMonths(input: {
  shortcode: string;
  months: string[];
  paid: boolean;
  settle?: SettleInput;
}): Promise<void> {
  const code = input.shortcode.toUpperCase();
  const months = input.months.map((month) => month.slice(0, 7));
  const owing = input.paid
    ? await getUnpaidYoutubeOwing(code, months)
    : { total: 0 };
  await bulkToggleYouTubeMonthsPaid(code, months, input.paid);
  if (input.paid && input.settle) {
    await settlePayment(
      code,
      owing.total,
      settlementTail(input.settle),
      `YouTube ${months.join(", ")}`,
    );
  }
}

export async function ownerUpdateUser(input: {
  shortcode: string;
  field:
    | "first_name"
    | "last_name"
    | "shortcode"
    | "telegram_username"
    | "telegram_user_id";
  value: string;
}): Promise<void> {
  await updateTelegramUserField(input.shortcode, input.field, input.value);
}

export async function ownerLogFitness(input: {
  logDate?: string;
  weightKg: number;
  gymStatus: GymStatus;
  gymSession?: string;
  gymMinutes?: number;
}): Promise<void> {
  const logDate = input.logDate?.trim() || todayInPhnomPenh();
  const dateError = validateLogDate(logDate);
  if (dateError) throw new MiniAppError(dateError);

  const weight = parseWeightKg(String(input.weightKg));
  if (weight === null) {
    throw new MiniAppError("Weight must be a valid number in kg.");
  }

  if (input.gymStatus === "gym") {
    const session = parseGymSessionInput(input.gymSession ?? "");
    const minutes = parseGymMinutes(String(input.gymMinutes ?? ""));
    if (!session) throw new MiniAppError("Session must be 1–50 characters.");
    if (minutes === null) {
      throw new MiniAppError("Minutes must be a number between 1 and 600.");
    }
    await upsertDailyLog({
      log_date: logDate,
      weight_kg: weight,
      gym_status: "gym",
      gym_session: session,
      gym_minutes: minutes,
    });
    return;
  }

  await upsertDailyLog({
    log_date: logDate,
    weight_kg: weight,
    gym_status: input.gymStatus,
    gym_session: null,
    gym_minutes: null,
  });
}

export async function ownerSetGymReminder(enabled: boolean): Promise<boolean> {
  await setGymMotivationReminderEnabled(enabled);
  return enabled;
}

export async function ownerAddTodo(input: {
  title: string;
  listSlug?: string;
  dueAt?: string | null;
  remind: boolean;
  ownerTelegramId: number;
}): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new MiniAppError("Title is required.");
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    throw new MiniAppError("Invalid due date.");
  }
  await addTodo({
    title,
    listSlug: input.listSlug,
    dueAt,
    remindChatId: input.remind && dueAt ? input.ownerTelegramId : undefined,
  });
}

export async function ownerSetTodoDone(id: number, done: boolean): Promise<void> {
  const result = await setTodoDone(id, done);
  if (!result) throw new MiniAppError("Todo not found.");
}

export async function ownerCancelTodo(id: number): Promise<void> {
  const result = await cancelTodo(id);
  if (!result) throw new MiniAppError("Todo not found.");
}

export async function ownerMoveTodo(id: number, listSlug: string): Promise<void> {
  const result = await moveTodo(id, listSlug);
  if (!result) throw new MiniAppError("Todo not found.");
}

export async function ownerCreateList(slug: string): Promise<void> {
  await createList(slug);
}

export async function ownerDeleteList(slug: string): Promise<void> {
  await deleteList(slug);
}

export async function ownerSearchTodos(query: string) {
  return searchTodos(query);
}

export async function ownerAddReminder(input: {
  title: string;
  date: string;
  time: string;
  recurrence: Recurrence | null;
  ownerTelegramId: number;
}): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new MiniAppError("Title is required.");
  const at = combineDateAndClock(input.date, input.time);
  if (!at) throw new MiniAppError("Use a valid date and time.");
  await addReminder({
    title,
    remindAt: at,
    targetChatId: input.ownerTelegramId,
    recurrence: input.recurrence,
  });
}

export async function ownerCancelReminder(id: number): Promise<void> {
  const result = await cancelReminder(id);
  if (!result) throw new MiniAppError("Reminder not found.");
}

export async function ownerAddFee(input: {
  fee: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}): Promise<void> {
  await addYoutubeFeeSchedule(
    input.fee,
    input.effectiveFrom,
    input.effectiveTo ?? null,
  );
}

export async function ownerUpdateSticker(input: {
  command: string;
  patch: Partial<CommandFollowupStickerRule>;
}): Promise<void> {
  const command = parseConfigurableCommandKey(input.command);
  if (!command) throw new MiniAppError("Unknown command.");
  await updateCommandFollowupStickerRule(command, input.patch);
}

export async function ownerRunCron(
  job: "youtube" | "fitness" | "gym" | "reminders" | "word" | "random-word",
): Promise<string> {
  const labels = {
    youtube: "YouTube reminder",
    fitness: "Fitness reminder",
    gym: "Gym motivation",
    reminders: "Due reminders",
    word: "Word of the day",
    "random-word": "Random word",
  } as const;
  const result =
    job === "youtube"
      ? await runYoutubeReminderCron()
      : job === "fitness"
        ? await runFitnessReminderCron({ force: true })
        : job === "gym"
          ? await runGymMotivationCron({ force: true })
          : job === "word"
            ? await runWordOfTheDayCron()
            : job === "random-word"
              ? await runRandomWordCron()
              : await runReminderCron();
  return formatCronJobReply(labels[job], result);
}
