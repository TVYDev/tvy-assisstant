import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { taskWizardSessions } from "./db/schema";
import { cancelSession } from "./fitness-log";
import {
  addDaysToDateString,
  combineDateAndClock,
  formatLocalDateTime,
  normalizeListSlug,
  parseClockToken,
  parseDateToken,
  parseRecurrenceToken,
  type Recurrence,
} from "./reminder-time";
import { addReminder, resolveTargetChatId } from "./reminders";
import { addTodo, listTodoLists } from "./todos";

export const TASK_WIZARD_CALLBACK_PREFIX = "tk";
export const TASK_WIZARD_TIME_CHIPS = ["09:00", "12:00", "18:00", "20:00"] as const;

const SESSION_TTL_MS = 30 * 60 * 1000;

export type TaskWizardKind = "todo" | "reminder";
export type TaskWizardStep =
  | "list"
  | "new_list"
  | "title"
  | "due"
  | "when"
  | "time"
  | "repeat"
  | "who";

export interface TaskWizardPayload {
  list_slug?: string;
  title?: string;
  due_date?: string;
  due_clock?: string;
  recurrence?: Recurrence | null;
  target_token?: string;
}

export interface TaskWizardSession {
  telegram_user_id: number;
  kind: TaskWizardKind;
  step: TaskWizardStep;
  payload: TaskWizardPayload;
  expires_at: string;
}

export type TaskWizardKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TaskWizardKeyboard = TaskWizardKeyboardButton[][];

export interface AdvanceTaskWizardResult {
  reply: string;
  done: boolean;
  keyboard?: TaskWizardKeyboard;
}

function dbError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${message}`);
}

function sessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

function isExpired(session: TaskWizardSession): boolean {
  return new Date(session.expires_at).getTime() <= Date.now();
}

function parsePayload(raw: string): TaskWizardPayload {
  try {
    const value = JSON.parse(raw) as TaskWizardPayload;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function mapSession(row: typeof taskWizardSessions.$inferSelect): TaskWizardSession {
  return {
    telegram_user_id: row.telegramUserId,
    kind: row.kind as TaskWizardKind,
    step: row.step as TaskWizardStep,
    payload: parsePayload(row.payload),
    expires_at: row.expiresAt,
  };
}

export function taskListFooterKeyboard(): TaskWizardKeyboard {
  return [
    [
      { text: "Add todo", callback_data: "om:run:todo" },
      { text: "Add reminder", callback_data: "om:run:remind" },
    ],
    [
      { text: "Today", callback_data: "om:run:todos:today" },
      { text: "All", callback_data: "om:run:todos" },
    ],
    [{ text: "Cancel wizard", callback_data: "om:run:canceltask" }],
  ];
}

export function cancelWizardKeyboard(): TaskWizardKeyboard {
  return [[{ text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` }]];
}

export async function getTaskWizardSession(
  telegramUserId: number,
): Promise<TaskWizardSession | null> {
  try {
    const row = await getDb().query.taskWizardSessions.findFirst({
      where: eq(taskWizardSessions.telegramUserId, telegramUserId),
    });
    if (!row) return null;
    const session = mapSession(row);
    if (isExpired(session)) {
      await cancelTaskWizard(telegramUserId);
      return null;
    }
    return session;
  } catch (error) {
    throw dbError("Failed to get task wizard", error);
  }
}

export async function cancelTaskWizard(telegramUserId: number): Promise<void> {
  try {
    await getDb()
      .delete(taskWizardSessions)
      .where(eq(taskWizardSessions.telegramUserId, telegramUserId));
  } catch (error) {
    throw dbError("Failed to cancel task wizard", error);
  }
}

async function saveSession(
  telegramUserId: number,
  kind: TaskWizardKind,
  step: TaskWizardStep,
  payload: TaskWizardPayload,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await getDb()
      .insert(taskWizardSessions)
      .values({
        telegramUserId,
        kind,
        step,
        payload: JSON.stringify(payload),
        expiresAt: sessionExpiryIso(),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: taskWizardSessions.telegramUserId,
        set: {
          kind,
          step,
          payload: JSON.stringify(payload),
          expiresAt: sessionExpiryIso(),
          updatedAt: now,
        },
      });
  } catch (error) {
    throw dbError("Failed to save task wizard", error);
  }
}

export async function startTaskWizard(
  telegramUserId: number,
  kind: TaskWizardKind,
): Promise<AdvanceTaskWizardResult> {
  await cancelSession(telegramUserId);

  if (kind === "todo") {
    await saveSession(telegramUserId, "todo", "list", {});
    return {
      reply: "📋 New todo — pick a list, or tap New list.",
      done: false,
      keyboard: await buildListKeyboard(),
    };
  }

  await saveSession(telegramUserId, "reminder", "title", {});
  return {
    reply: "⏰ New reminder — what should I remind you about?",
    done: false,
    keyboard: cancelWizardKeyboard(),
  };
}

async function buildListKeyboard(): Promise<TaskWizardKeyboard> {
  const lists = await listTodoLists();
  const rows: TaskWizardKeyboard = [];
  let row: TaskWizardKeyboardButton[] = [];
  for (const list of lists) {
    row.push({
      text: list.title,
      callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:list:${list.slug}`,
    });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([
    { text: "New list", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:newlist` },
    { text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` },
  ]);
  return rows;
}

function dueKeyboard(): TaskWizardKeyboard {
  return [
    [
      { text: "Skip", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:skip` },
      { text: "Today", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:today` },
    ],
    [
      { text: "Tomorrow", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:tomorrow` },
      { text: "Type a date", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:type` },
    ],
    [{ text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` }],
  ];
}

function whenKeyboard(): TaskWizardKeyboard {
  return [
    [
      { text: "Today", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:today` },
      { text: "Tomorrow", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:tomorrow` },
    ],
    [{ text: "Type a date", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:due:type` }],
    [{ text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` }],
  ];
}

function timeKeyboard(): TaskWizardKeyboard {
  return [
    TASK_WIZARD_TIME_CHIPS.slice(0, 2).map((clock) => ({
      text: clock,
      callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:clock:${clock.replace(":", "")}`,
    })),
    TASK_WIZARD_TIME_CHIPS.slice(2).map((clock) => ({
      text: clock,
      callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:clock:${clock.replace(":", "")}`,
    })),
    [
      { text: "Type HH:mm", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:clock:type` },
      { text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` },
    ],
  ];
}

function repeatKeyboard(): TaskWizardKeyboard {
  return [
    [
      { text: "Once", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:repeat:once` },
      { text: "Daily", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:repeat:daily` },
    ],
    [
      { text: "Weekly", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:repeat:weekly` },
      { text: "Weekdays", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:repeat:weekdays` },
    ],
    [{ text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` }],
  ];
}

function whoKeyboard(): TaskWizardKeyboard {
  return [
    [
      { text: "Me", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:who:me` },
      { text: "Here", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:who:here` },
    ],
    [{ text: "Type target", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:who:type` }],
    [{ text: "Cancel", callback_data: `${TASK_WIZARD_CALLBACK_PREFIX}:cancel` }],
  ];
}

export function parseTaskWizardCallback(data: string): string | null {
  if (!data.startsWith(`${TASK_WIZARD_CALLBACK_PREFIX}:`)) return null;
  return data.slice(TASK_WIZARD_CALLBACK_PREFIX.length + 1);
}

export async function advanceTaskWizard(
  telegramUserId: number,
  input: string,
  context: { chatId: number; ownerId: number },
  now = new Date(),
): Promise<AdvanceTaskWizardResult> {
  const session = await getTaskWizardSession(telegramUserId);
  if (!session) {
    return { reply: "No add wizard running. Tap Add todo or Add reminder.", done: true };
  }

  if (input === "cancel") {
    await cancelTaskWizard(telegramUserId);
    return { reply: "Add wizard cancelled.", done: true };
  }

  if (session.kind === "todo") {
    return advanceTodoWizard(session, input, context, now);
  }
  return advanceReminderWizard(session, input, context, now);
}

async function advanceTodoWizard(
  session: TaskWizardSession,
  input: string,
  context: { chatId: number; ownerId: number },
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  switch (session.step) {
    case "list":
      return handleTodoListStep(session, input);
    case "new_list":
      return handleNewListStep(session, input);
    case "title":
      return handleTodoTitleStep(session, input);
    case "due":
      return handleDueStep(session, input, context, now);
    case "time":
      return handleTimeStep(session, input, context, now);
    default:
      return { reply: "Unknown wizard step. Send /canceltask.", done: false };
  }
}

async function handleTodoListStep(
  session: TaskWizardSession,
  input: string,
): Promise<AdvanceTaskWizardResult> {
  if (input === "newlist") {
    await saveSession(session.telegram_user_id, "todo", "new_list", session.payload);
    return {
      reply: "Name the list (letters, numbers, dashes). Example: shopping",
      done: false,
      keyboard: cancelWizardKeyboard(),
    };
  }

  if (!input.startsWith("list:")) {
    return {
      reply: "Pick a list from the buttons, or tap New list.",
      done: false,
      keyboard: await buildListKeyboard(),
    };
  }

  const slug = normalizeListSlug(input.slice("list:".length));
  if (!slug) {
    return {
      reply: "That list name isn't valid. Pick another.",
      done: false,
      keyboard: await buildListKeyboard(),
    };
  }

  await saveSession(session.telegram_user_id, "todo", "title", { list_slug: slug });
  return {
    reply: `List #${slug}. What's the todo?`,
    done: false,
    keyboard: cancelWizardKeyboard(),
  };
}

async function handleNewListStep(
  session: TaskWizardSession,
  input: string,
): Promise<AdvanceTaskWizardResult> {
  const slug = normalizeListSlug(input);
  if (!slug) {
    return {
      reply: "List name must be letters, numbers, or dashes. Try again.",
      done: false,
      keyboard: cancelWizardKeyboard(),
    };
  }
  await saveSession(session.telegram_user_id, "todo", "title", { list_slug: slug });
  return {
    reply: `List #${slug}. What's the todo?`,
    done: false,
    keyboard: cancelWizardKeyboard(),
  };
}

async function handleTodoTitleStep(
  session: TaskWizardSession,
  input: string,
): Promise<AdvanceTaskWizardResult> {
  const title = input.trim();
  if (!title || title.startsWith("list:") || title.startsWith("due:")) {
    return {
      reply: "Type the todo text.",
      done: false,
      keyboard: cancelWizardKeyboard(),
    };
  }
  await saveSession(session.telegram_user_id, "todo", "due", {
    ...session.payload,
    title,
  });
  return {
    reply: "Due date? Skip if it's just a checklist item.",
    done: false,
    keyboard: dueKeyboard(),
  };
}

async function handleDueStep(
  session: TaskWizardSession,
  input: string,
  context: { chatId: number; ownerId: number },
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  if (input === "due:skip" || input === "skip") {
    if (session.kind !== "todo") {
      return {
        reply: "Reminders need a date. Pick Today / Tomorrow, or type YYYY-MM-DD.",
        done: false,
        keyboard: whenKeyboard(),
      };
    }
    return finishTodo(session, context, null, now);
  }
  if (input === "due:type") {
    return {
      reply: "Send a date like 2026-09-20, or today / tomorrow.",
      done: false,
      keyboard: dueKeyboard(),
    };
  }

  const dateToken = input.startsWith("due:") ? input.slice("due:".length) : input;
  const dateStr = parseDateToken(dateToken, now);
  if (!dateStr) {
    return {
      reply: "Pick Skip / Today / Tomorrow, or type YYYY-MM-DD.",
      done: false,
      keyboard: dueKeyboard(),
    };
  }

  await saveSession(session.telegram_user_id, session.kind, "time", {
    ...session.payload,
    due_date: dateStr,
  });
  return {
    reply: `Date set to ${dateStr}. What time?`,
    done: false,
    keyboard: timeKeyboard(),
  };
}

async function handleTimeStep(
  session: TaskWizardSession,
  input: string,
  context: { chatId: number; ownerId: number },
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  if (session.kind === "reminder") {
    return handleReminderTimeStep(session, input, now);
  }

  const clock = parseWizardClock(input);
  if (input === "clock:type") {
    return {
      reply: "Send a time like 15:00.",
      done: false,
      keyboard: timeKeyboard(),
    };
  }
  if (!clock || !session.payload.due_date) {
    return {
      reply: "Pick a time chip or type HH:mm.",
      done: false,
      keyboard: timeKeyboard(),
    };
  }

  const resolved = resolveDueDateTime(session.payload.due_date, clock, now);
  if (!resolved.ok) {
    return { reply: resolved.error, done: false, keyboard: timeKeyboard() };
  }

  return finishTodo(
    { ...session, payload: { ...session.payload, due_date: resolved.dateStr, due_clock: clock } },
    context,
    resolved.at,
    now,
    resolved.rolled
      ? `That time already passed, so I set ${formatLocalDateTime(resolved.at, now)}.\n\n`
      : "",
  );
}

async function finishTodo(
  session: TaskWizardSession,
  context: { chatId: number; ownerId: number },
  dueAt: Date | null,
  now: Date,
  prefix = "",
): Promise<AdvanceTaskWizardResult> {
  const title = session.payload.title?.trim();
  if (!title) {
    return { reply: "Missing title. Send /canceltask and start again.", done: true };
  }

  const todo = await addTodo({
    title,
    listSlug: session.payload.list_slug,
    dueAt,
    remindChatId: context.ownerId,
  });
  await cancelTaskWizard(session.telegram_user_id);

  const dueLine = dueAt
    ? `\nDue ${formatLocalDateTime(dueAt, now)} — I'll remind you.`
    : "";
  return {
    reply: `${prefix}✅ Added #${todo.id} to #${todo.list_slug}: ${todo.title}${dueLine}`,
    done: true,
  };
}

async function advanceReminderWizard(
  session: TaskWizardSession,
  input: string,
  context: { chatId: number; ownerId: number },
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  switch (session.step) {
    case "title":
      return handleReminderTitleStep(session, input);
    case "when":
      return handleDueStep(session, input, context, now);
    case "time":
      return handleReminderTimeStep(session, input, now);
    case "repeat":
      return handleRepeatStep(session, input);
    case "who":
      return handleWhoStep(session, input, context, now);
    default:
      return { reply: "Unknown wizard step. Send /canceltask.", done: false };
  }
}

async function handleReminderTitleStep(
  session: TaskWizardSession,
  input: string,
): Promise<AdvanceTaskWizardResult> {
  const title = input.trim();
  if (!title || title.startsWith("due:") || title.startsWith("repeat:")) {
    return {
      reply: "Type the reminder text.",
      done: false,
      keyboard: cancelWizardKeyboard(),
    };
  }
  await saveSession(session.telegram_user_id, "reminder", "when", {
    ...session.payload,
    title,
  });
  return {
    reply: "When should I ping you?",
    done: false,
    keyboard: whenKeyboard(),
  };
}

async function handleReminderTimeStep(
  session: TaskWizardSession,
  input: string,
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  if (input === "clock:type") {
    return {
      reply: "Send a time like 15:00.",
      done: false,
      keyboard: timeKeyboard(),
    };
  }
  const clock = parseWizardClock(input);
  if (!clock || !session.payload.due_date) {
    return {
      reply: "Pick a time chip or type HH:mm.",
      done: false,
      keyboard: timeKeyboard(),
    };
  }

  const resolved = resolveDueDateTime(session.payload.due_date, clock, now);
  if (!resolved.ok) {
    return { reply: resolved.error, done: false, keyboard: timeKeyboard() };
  }

  await saveSession(session.telegram_user_id, "reminder", "repeat", {
    ...session.payload,
    due_date: resolved.dateStr,
    due_clock: clock,
  });

  const prefix = resolved.rolled
    ? `That time already passed, so I set ${formatLocalDateTime(resolved.at, now)}.\n\n`
    : "";
  return {
    reply: `${prefix}Repeat?`,
    done: false,
    keyboard: repeatKeyboard(),
  };
}

async function handleRepeatStep(
  session: TaskWizardSession,
  input: string,
): Promise<AdvanceTaskWizardResult> {
  const raw = input.startsWith("repeat:") ? input.slice("repeat:".length) : input;
  if (raw === "once") {
    await saveSession(session.telegram_user_id, "reminder", "who", {
      ...session.payload,
      recurrence: null,
    });
    return {
      reply: "Who should get it? Default is you.",
      done: false,
      keyboard: whoKeyboard(),
    };
  }

  const recurrence = parseRecurrenceToken(raw);
  if (!recurrence) {
    return {
      reply: "Pick Once / Daily / Weekly / Weekdays.",
      done: false,
      keyboard: repeatKeyboard(),
    };
  }

  await saveSession(session.telegram_user_id, "reminder", "who", {
    ...session.payload,
    recurrence,
  });
  return {
    reply: "Who should get it? Default is you.",
    done: false,
    keyboard: whoKeyboard(),
  };
}

async function handleWhoStep(
  session: TaskWizardSession,
  input: string,
  context: { chatId: number; ownerId: number },
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  if (input === "who:type") {
    return {
      reply: "Send me, here, a shortcode, @username, or chat id.",
      done: false,
      keyboard: whoKeyboard(),
    };
  }

  const token = input.startsWith("who:") ? input.slice("who:".length) : input;
  const resolved = await resolveTargetChatId({
    token,
    ownerId: context.ownerId,
    currentChatId: context.chatId,
  });
  if (!resolved.ok) {
    return {
      reply: resolved.error,
      done: false,
      keyboard: whoKeyboard(),
    };
  }

  return finishReminder(session, resolved.chatId, now);
}

async function finishReminder(
  session: TaskWizardSession,
  targetChatId: number,
  now: Date,
): Promise<AdvanceTaskWizardResult> {
  const title = session.payload.title?.trim();
  if (!title || !session.payload.due_date || !session.payload.due_clock) {
    await cancelTaskWizard(session.telegram_user_id);
    return { reply: "Wizard lost the title or time. Send /canceltask and start again.", done: true };
  }

  const at = combineDateAndClock(session.payload.due_date, session.payload.due_clock);
  if (!at) {
    await cancelTaskWizard(session.telegram_user_id);
    return { reply: "Could not build that reminder time. Try again.", done: true };
  }

  const reminder = await addReminder({
    title,
    remindAt: at,
    targetChatId,
    recurrence: session.payload.recurrence ?? null,
  });
  await cancelTaskWizard(session.telegram_user_id);

  const repeat = reminder.recurrence ? ` · ${reminder.recurrence}` : "";
  return {
    reply: `✅ Reminder #${reminder.id}: ${reminder.title} — ${formatLocalDateTime(at, now)}${repeat}`,
    done: true,
  };
}

function resolveDueDateTime(
  dateStr: string | undefined,
  clock: string,
  now: Date,
):
  | { ok: true; at: Date; dateStr: string; rolled: boolean }
  | { ok: false; error: string } {
  if (!dateStr) {
    return { ok: false, error: "Pick a time chip or type HH:mm." };
  }
  let at = combineDateAndClock(dateStr, clock);
  if (!at) {
    return { ok: false, error: "That time isn't valid. Try 09:00." };
  }
  if (at.getTime() > now.getTime()) {
    return { ok: true, at, dateStr, rolled: false };
  }
  const rolled = addDaysToDateString(dateStr, 1);
  at = combineDateAndClock(rolled, clock);
  if (!at) {
    return { ok: false, error: "Could not roll that time forward." };
  }
  return { ok: true, at, dateStr: rolled, rolled: true };
}

function parseWizardClock(input: string): string | null {
  if (input.startsWith("clock:")) {
    const raw = input.slice("clock:".length);
    if (raw === "type") return null;
    if (/^\d{3,4}$/.test(raw)) {
      const padded = raw.padStart(4, "0");
      return `${padded.slice(0, 2)}:${padded.slice(2)}`;
    }
    return parseClockToken(raw) ? raw : null;
  }
  return parseClockToken(input) ? input : null;
}
