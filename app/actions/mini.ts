"use server";

import { requireMiniOwner } from "@/lib/mini-app/auth";
import { actionErrorMessage } from "@/lib/mini-app/http";
import * as mutations from "@/lib/mini-app/mutations";
import type { SettleInput } from "@/lib/mini-app/mutations";
import type { Recurrence } from "@/lib/reminder-time";
import type { GymStatus } from "@/lib/fitness-log";
import type { CommandFollowupStickerRule } from "@/lib/command-followup-stickers";

async function runOwner<T>(
  initData: string,
  fn: (ownerId: number) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const session = await requireMiniOwner(initData);
    const data = await fn(session.user.id);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error) };
  }
}

export async function addDebtAction(
  initData: string,
  input: { shortcode: string; amount: number; description: string },
) {
  return runOwner(initData, () => mutations.ownerAddDebt(input));
}

export async function updateDebtAction(
  initData: string,
  input: { itemId: number; amount: number; description: string },
) {
  return runOwner(initData, () => mutations.ownerUpdateDebt(input));
}

export async function cancelDebtAction(initData: string, itemId: number) {
  return runOwner(initData, () => mutations.ownerCancelDebt(itemId));
}

export async function toggleDebtPaidAction(
  initData: string,
  input: { itemId: number; paid: boolean; settle?: SettleInput },
) {
  return runOwner(initData, () => mutations.ownerToggleDebtPaid(input));
}

export async function payAllAction(
  initData: string,
  input: { shortcode: string; settle: SettleInput },
) {
  return runOwner(initData, () => mutations.ownerPayAll(input));
}

export async function addDepositAction(
  initData: string,
  input: { shortcode: string; amount: number; note?: string },
) {
  return runOwner(initData, () => mutations.ownerAddDeposit(input));
}

export async function reduceDepositAction(
  initData: string,
  input: { shortcode: string; amount: number; note?: string },
) {
  return runOwner(initData, () => mutations.ownerReduceDeposit(input));
}

export async function toggleYoutubeMonthAction(
  initData: string,
  input: {
    shortcode: string;
    month: string;
    paid: boolean;
    settle?: SettleInput;
  },
) {
  return runOwner(initData, () => mutations.ownerToggleYoutubeMonth(input));
}

export async function toggleAllYoutubeAction(
  initData: string,
  input: { shortcode: string; paid: boolean; settle?: SettleInput },
) {
  return runOwner(initData, () => mutations.ownerToggleAllYoutube(input));
}

export async function updateUserAction(
  initData: string,
  input: {
    shortcode: string;
    field:
      | "first_name"
      | "last_name"
      | "shortcode"
      | "telegram_username"
      | "telegram_user_id";
    value: string;
  },
) {
  return runOwner(initData, () => mutations.ownerUpdateUser(input));
}

export async function logFitnessAction(
  initData: string,
  input: {
    logDate?: string;
    weightKg: number;
    gymStatus: GymStatus;
    gymSession?: string;
    gymMinutes?: number;
  },
) {
  return runOwner(initData, () => mutations.ownerLogFitness(input));
}

export async function setGymReminderAction(initData: string, enabled: boolean) {
  return runOwner(initData, () => mutations.ownerSetGymReminder(enabled));
}

export async function addTodoAction(
  initData: string,
  input: {
    title: string;
    listSlug?: string;
    dueAt?: string | null;
    remind: boolean;
  },
) {
  return runOwner(initData, (ownerId) =>
    mutations.ownerAddTodo({ ...input, ownerTelegramId: ownerId }),
  );
}

export async function setTodoDoneAction(
  initData: string,
  id: number,
  done: boolean,
) {
  return runOwner(initData, () => mutations.ownerSetTodoDone(id, done));
}

export async function cancelTodoAction(initData: string, id: number) {
  return runOwner(initData, () => mutations.ownerCancelTodo(id));
}

export async function moveTodoAction(
  initData: string,
  id: number,
  listSlug: string,
) {
  return runOwner(initData, () => mutations.ownerMoveTodo(id, listSlug));
}

export async function createListAction(initData: string, slug: string) {
  return runOwner(initData, () => mutations.ownerCreateList(slug));
}

export async function deleteListAction(initData: string, slug: string) {
  return runOwner(initData, () => mutations.ownerDeleteList(slug));
}

export async function addReminderAction(
  initData: string,
  input: {
    title: string;
    date: string;
    time: string;
    recurrence: Recurrence | null;
  },
) {
  return runOwner(initData, (ownerId) =>
    mutations.ownerAddReminder({ ...input, ownerTelegramId: ownerId }),
  );
}

export async function cancelReminderAction(initData: string, id: number) {
  return runOwner(initData, () => mutations.ownerCancelReminder(id));
}

export async function addFeeAction(
  initData: string,
  input: { fee: number; effectiveFrom: string; effectiveTo?: string | null },
) {
  return runOwner(initData, () => mutations.ownerAddFee(input));
}

export async function updateStickerAction(
  initData: string,
  input: { command: string; patch: Partial<CommandFollowupStickerRule> },
) {
  return runOwner(initData, () => mutations.ownerUpdateSticker(input));
}

export async function toggleWordUserAction(initData: string, userId: number) {
  return runOwner(initData, () => mutations.ownerToggleWordUser(userId));
}

export async function addWordGroupAction(initData: string, chatId: string) {
  return runOwner(initData, () => mutations.ownerAddWordGroup(chatId));
}

export async function removeWordGroupAction(initData: string, chatId: string) {
  return runOwner(initData, () => mutations.ownerRemoveWordGroup(chatId));
}

export async function runCronAction(
  initData: string,
  job: "youtube" | "fitness" | "gym" | "reminders" | "word" | "random-word",
) {
  return runOwner(initData, () => mutations.ownerRunCron(job));
}
