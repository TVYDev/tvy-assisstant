import {
  REMINDER_TIMEZONE,
  startOfDayInPhnomPenh,
  todayInPhnomPenh,
} from "../reminder-time";
import type { TodoRecord } from "../todos";

export const INBOX_SLUG = "inbox";
export const TODO_SWIPE_THRESHOLD = 72;

export function resolveTodoSwipe(
  offset: number,
  canDelete: boolean,
  threshold = TODO_SWIPE_THRESHOLD,
): "toggle" | "delete" | null {
  if (offset >= threshold) return "toggle";
  if (offset <= -threshold && canDelete) return "delete";
  return null;
}

const LIST_DOTS = [
  "#ff453a",
  "#ff9f0a",
  "#ffd60a",
  "#30d158",
  "#64d2ff",
  "#5e5ce6",
  "#bf5af2",
];

export function listDotColor(slug: string): string {
  if (slug === INBOX_SLUG) return "#8e8e93";
  let hash = 0;
  for (const char of slug) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return LIST_DOTS[hash % LIST_DOTS.length];
}

export function defaultTodayDueAt(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatHeadingDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REMINDER_TIMEZONE,
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = (parts.find((part) => part.type === "month")?.value ?? "")
    .toLowerCase()
    .replace(".", "")
    .slice(0, 3);
  return `${day} ${month}.`;
}

export function formatTodoClock(dueAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REMINDER_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(dueAt))
    .toLowerCase()
    .replace(/\s/g, "");
}

export function formatTodoDueMeta(
  dueAt: string | null,
  now = new Date(),
): { label: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const clock = formatTodoClock(dueAt);
  const dueDay = todayInPhnomPenh(due);
  const today = todayInPhnomPenh(now);
  if (due.getTime() < startOfDayInPhnomPenh(now).getTime()) {
    return { label: `overdue · ${clock}`, overdue: true };
  }
  if (dueDay === today) return { label: clock, overdue: false };
  return { label: `${formatHeadingDate(due)} · ${clock}`, overdue: false };
}

export function formatReminderGlance(remindAt: string, now = new Date()): string {
  return formatTodoDueMeta(remindAt, now)?.label ?? formatTodoClock(remindAt);
}

export function applyTodoDone<
  T extends {
    open: TodoRecord[];
    doneToday?: TodoRecord[];
    done?: TodoRecord[];
  },
>(todos: T, id: number, done: boolean): T {
  const doneList = todos.done ?? [];
  const doneToday = todos.doneToday ?? [];
  const current =
    todos.open.find((row) => row.id === id) ??
    doneToday.find((row) => row.id === id) ??
    doneList.find((row) => row.id === id);
  if (!current) return todos;

  const next = { ...current, done };
  const without = (rows: TodoRecord[]) => rows.filter((row) => row.id !== id);

  if (done) {
    return {
      ...todos,
      open: without(todos.open),
      done: without(doneList),
      doneToday: [next, ...without(doneToday)],
    };
  }

  return {
    ...todos,
    open: [next, ...without(todos.open)],
    done: without(doneList),
    doneToday: without(doneToday),
  };
}

export function removeTodo<
  T extends {
    open: TodoRecord[];
    doneToday?: TodoRecord[];
    done?: TodoRecord[];
  },
>(todos: T, id: number): T {
  const without = (rows: TodoRecord[] = []) => rows.filter((row) => row.id !== id);
  return {
    ...todos,
    open: without(todos.open),
    doneToday: without(todos.doneToday),
    done: without(todos.done),
  };
}

