import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "./db";
import { reminders, telegramUsers, todos } from "./db/schema";
import {
  bumpUntilFuture,
  formatLocalDateTime,
  isTargetToken,
  parseRemindInput,
  type Recurrence,
} from "./reminder-time";

export const REMINDER_DONE_CALLBACK_PREFIX = "td";

export type ReminderStatus = "pending" | "sent" | "cancelled";

export interface ReminderRecord {
  id: number;
  title: string;
  remind_at: string;
  recurrence: Recurrence | null;
  target_chat_id: number;
  status: ReminderStatus;
  todo_id: number | null;
  last_sent_at: string | null;
}

export interface ReminderKeyboardButton {
  text: string;
  callback_data: string;
}

export type ReminderKeyboard = ReminderKeyboardButton[][];

function dbError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${message}`);
}

function mapReminder(row: typeof reminders.$inferSelect): ReminderRecord {
  return {
    id: row.id,
    title: row.title,
    remind_at: row.remindAt,
    recurrence: (row.recurrence as Recurrence | null) ?? null,
    target_chat_id: row.targetChatId,
    status: row.status as ReminderStatus,
    todo_id: row.todoId,
    last_sent_at: row.lastSentAt,
  };
}

export async function addReminder(input: {
  title: string;
  remindAt: Date;
  targetChatId: number;
  recurrence?: Recurrence | null;
  todoId?: number | null;
}): Promise<ReminderRecord> {
  try {
    const [row] = await getDb()
      .insert(reminders)
      .values({
        title: input.title,
        remindAt: input.remindAt.toISOString(),
        recurrence: input.recurrence ?? null,
        targetChatId: input.targetChatId,
        status: "pending",
        todoId: input.todoId ?? null,
        updatedAt: new Date().toISOString(),
      })
      .returning();
    return mapReminder(row);
  } catch (error) {
    throw dbError("Failed to add reminder", error);
  }
}

export async function listPendingReminders(): Promise<ReminderRecord[]> {
  try {
    const rows = await getDb().query.reminders.findMany({
      where: eq(reminders.status, "pending"),
      orderBy: (table, { asc: orderAsc }) => [orderAsc(table.remindAt)],
    });
    return rows.map(mapReminder);
  } catch (error) {
    throw dbError("Failed to list reminders", error);
  }
}

export async function getReminderById(id: number): Promise<ReminderRecord | null> {
  try {
    const row = await getDb().query.reminders.findFirst({
      where: eq(reminders.id, id),
    });
    return row ? mapReminder(row) : null;
  } catch (error) {
    throw dbError("Failed to get reminder", error);
  }
}

export async function cancelReminder(id: number): Promise<ReminderRecord | null> {
  try {
    const [row] = await getDb()
      .update(reminders)
      .set({
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(reminders.id, id), eq(reminders.status, "pending")))
      .returning();
    return row ? mapReminder(row) : null;
  } catch (error) {
    throw dbError("Failed to cancel reminder", error);
  }
}

export async function cancelReminderForTodo(todoId: number): Promise<void> {
  try {
    const [row] = await getDb()
      .update(reminders)
      .set({
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(reminders.todoId, todoId), eq(reminders.status, "pending")))
      .returning();

    if (row) {
      await getDb()
        .update(todos)
        .set({ reminderId: null, updatedAt: new Date().toISOString() })
        .where(eq(todos.id, todoId));
    }
  } catch (error) {
    throw dbError("Failed to cancel linked reminder", error);
  }
}

export async function attachReminderToTodo(
  todoId: number,
  reminderId: number,
): Promise<void> {
  try {
    await getDb()
      .update(todos)
      .set({ reminderId, updatedAt: new Date().toISOString() })
      .where(eq(todos.id, todoId));
  } catch (error) {
    throw dbError("Failed to link reminder to todo", error);
  }
}

export async function listDueReminders(now = new Date()): Promise<ReminderRecord[]> {
  try {
    const rows = await getDb().query.reminders.findMany({
      where: and(eq(reminders.status, "pending"), lte(reminders.remindAt, now.toISOString())),
      orderBy: (table, { asc: orderAsc }) => [orderAsc(table.remindAt)],
    });
    return rows.map(mapReminder);
  } catch (error) {
    throw dbError("Failed to list due reminders", error);
  }
}

export async function claimDueReminders(
  now = new Date(),
): Promise<ReminderRecord[]> {
  const nowIso = now.toISOString();
  try {
    const claimed = await getDb()
      .update(reminders)
      .set({
        status: "sent",
        lastSentAt: nowIso,
        updatedAt: nowIso,
      })
      .where(and(eq(reminders.status, "pending"), lte(reminders.remindAt, nowIso)))
      .returning();

    const result: ReminderRecord[] = [];
    for (const row of claimed) {
      const mapped = mapReminder(row);
      if (mapped.recurrence) {
        const next = bumpUntilFuture(
          new Date(mapped.remind_at),
          mapped.recurrence,
          now,
        );
        await getDb()
          .update(reminders)
          .set({
            status: "pending",
            remindAt: next.toISOString(),
            updatedAt: nowIso,
          })
          .where(eq(reminders.id, mapped.id));
        result.push(mapped);
      } else {
        result.push(mapped);
      }
    }
    return result;
  } catch (error) {
    throw dbError("Failed to claim due reminders", error);
  }
}

export async function resolveTargetChatId(input: {
  token: string | null | undefined;
  ownerId: number;
  currentChatId: number;
}): Promise<{ ok: true; chatId: number } | { ok: false; error: string }> {
  const token = input.token?.trim();
  if (!token || token.toLowerCase() === "me") {
    if (!input.ownerId) {
      return { ok: false, error: "OWNER_TELEGRAM_ID is not set." };
    }
    return { ok: true, chatId: input.ownerId };
  }

  if (token.toLowerCase() === "here") {
    return { ok: true, chatId: input.currentChatId };
  }

  if (/^-?\d{5,}$/.test(token)) {
    return { ok: true, chatId: Number(token) };
  }

  const username = token.startsWith("@") ? token.slice(1) : null;
  try {
    const user = username
      ? await getDb().query.telegramUsers.findFirst({
          where: eq(telegramUsers.telegramUsername, username),
        })
      : await getDb().query.telegramUsers.findFirst({
          where: eq(telegramUsers.shortcode, token.toUpperCase()),
        });

    if (!user?.telegramUserId) {
      return {
        ok: false,
        error: username
          ? `No telegram_user_id on file for @${username}.`
          : `No telegram_user_id on file for ${token.toUpperCase()}.`,
      };
    }
    return { ok: true, chatId: user.telegramUserId };
  } catch (error) {
    throw dbError("Failed to resolve reminder target", error);
  }
}

export function formatRemindersList(
  items: ReminderRecord[],
  now = new Date(),
): string {
  if (items.length === 0) {
    return "⏰ No upcoming reminders.\n\nTap Add reminder or /remind to set one.";
  }

  const lines = [`⏰ Upcoming reminders (${items.length})`, ""];
  for (const item of items) {
    const when = formatLocalDateTime(new Date(item.remind_at), now);
    const repeat = item.recurrence ? ` · ${item.recurrence}` : "";
    const linked = item.todo_id ? ` · todo #${item.todo_id}` : "";
    lines.push(`#${item.id} ${item.title} — ${when}${repeat}${linked}`);
  }
  return lines.join("\n");
}

export function formatReminderMessage(
  reminder: ReminderRecord,
  now = new Date(),
): string {
  const when = formatLocalDateTime(new Date(reminder.remind_at), now);
  const repeat = reminder.recurrence ? `\nRepeats: ${reminder.recurrence}` : "";
  const linked = reminder.todo_id
    ? `\nLinked todo #${reminder.todo_id}`
    : "";
  return (
    `⏰ <b>Reminder!</b>\n\n${escapeHtml(reminder.title)}\nWhen: ${when}${repeat}${linked}\n\n` +
    "Dino remembered. You're welcome. 🦕"
  );
}

export function reminderDoneKeyboard(
  reminder: ReminderRecord,
): ReminderKeyboard | undefined {
  if (!reminder.todo_id) return undefined;
  return [
    [
      {
        text: "Done",
        callback_data: `${REMINDER_DONE_CALLBACK_PREFIX}:done:${reminder.todo_id}`,
      },
    ],
  ];
}

export function parseTodoDoneCallback(data: string): number | null {
  const parts = data.split(":");
  if (
    parts[0] !== REMINDER_DONE_CALLBACK_PREFIX ||
    parts[1] !== "done" ||
    !parts[2]
  ) {
    return null;
  }
  const id = Number(parts[2]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseRemindCommand(
  args: string,
  now = new Date(),
): ReturnType<typeof parseRemindInput> {
  return parseRemindInput(args, now);
}

export function looksLikeTargetToken(token: string): boolean {
  return isTargetToken(token);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
