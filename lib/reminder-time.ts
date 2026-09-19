export const REMINDER_TIMEZONE = "Asia/Phnom_Penh";
export const RECURRENCE_VALUES = ["daily", "weekly", "weekdays"] as const;
export type Recurrence = (typeof RECURRENCE_VALUES)[number];

const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SHORTCODE_RE = /^[A-Z]{2,8}$/;
const CHAT_ID_RE = /^-?\d{5,}$/;

export interface ParsedDateTime {
  at: Date;
  consumed: number;
}

export interface ParsedRemindInput {
  title: string;
  at: Date;
  recurrence: Recurrence | null;
  targetToken: string | null;
}

export interface ParsedAddTodoInput {
  listSlug: string | null;
  title: string;
  dueAt: Date | null;
}

export function todayInPhnomPenh(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REMINDER_TIMEZONE }).format(
    date,
  );
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function phnomPenhWeekday(date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: REMINDER_TIMEZONE,
    weekday: "short",
  }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

export function isWeekendInPhnomPenh(date = new Date()): boolean {
  const day = phnomPenhWeekday(date);
  return day === 0 || day === 6;
}

export function parseClockToken(token: string): { hour: number; minute: number } | null {
  const match = token.trim().match(CLOCK_RE);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseDateToken(
  token: string,
  now = new Date(),
): string | null {
  const lowered = token.trim().toLowerCase();
  if (lowered === "today") return todayInPhnomPenh(now);
  if (lowered === "tomorrow") return addDaysToDateString(todayInPhnomPenh(now), 1);

  const match = token.trim().match(DATE_RE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function phnomPenhDateTimeToUtc(
  dateStr: string,
  hour: number,
  minute: number,
): Date {
  const iso = `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`;
  return new Date(iso);
}

export function combineDateAndClock(
  dateStr: string,
  clock: string,
): Date | null {
  const parsed = parseClockToken(clock);
  if (!parsed) return null;
  return phnomPenhDateTimeToUtc(dateStr, parsed.hour, parsed.minute);
}

export function parseDateTimeTokens(
  tokens: string[],
  now = new Date(),
): ParsedDateTime | null {
  if (tokens.length === 0) return null;

  if (tokens.length >= 2) {
    const dateStr = parseDateToken(tokens[0], now);
    const clock = parseClockToken(tokens[1]);
    if (dateStr && clock) {
      return {
        at: phnomPenhDateTimeToUtc(dateStr, clock.hour, clock.minute),
        consumed: 2,
      };
    }
  }

  const clock = parseClockToken(tokens[0]);
  if (!clock) return null;

  const today = todayInPhnomPenh(now);
  let at = phnomPenhDateTimeToUtc(today, clock.hour, clock.minute);
  if (at.getTime() <= now.getTime()) {
    at = phnomPenhDateTimeToUtc(addDaysToDateString(today, 1), clock.hour, clock.minute);
  }
  return { at, consumed: 1 };
}

export function isRecurrenceToken(token: string): token is Recurrence {
  return RECURRENCE_VALUES.includes(token.toLowerCase() as Recurrence);
}

export function parseRecurrenceToken(token: string): Recurrence | null {
  const lowered = token.toLowerCase();
  return isRecurrenceToken(lowered) ? lowered : null;
}

export function isTargetToken(token: string): boolean {
  const lowered = token.toLowerCase();
  if (lowered === "me" || lowered === "here") return true;
  if (token.startsWith("@") && token.length > 1) return true;
  if (CHAT_ID_RE.test(token)) return true;
  return SHORTCODE_RE.test(token);
}

export function parseRemindInput(
  args: string,
  now = new Date(),
): { ok: true; value: ParsedRemindInput } | { ok: false; error: string } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, error: "Usage: /remind <time> <text> [daily|weekly|weekdays] [me|here|shortcode|@user|chat_id]" };
  }

  const parsedTime = parseDateTimeTokens(tokens, now);
  if (!parsedTime) {
    return {
      ok: false,
      error:
        "Start with a time.\nExamples:\n/remind tomorrow 15:00 Call dentist\n/remind 09:00 Gym daily\n/remind 2026-09-20 09:00 Pay rent here",
    };
  }

  const rest = tokens.slice(parsedTime.consumed);
  let targetToken: string | null = null;
  let recurrence: Recurrence | null = null;

  if (rest.length > 0 && isTargetToken(rest[rest.length - 1])) {
    targetToken = rest.pop() ?? null;
  }
  if (rest.length > 0 && isRecurrenceToken(rest[rest.length - 1])) {
    recurrence = parseRecurrenceToken(rest[rest.length - 1]);
    rest.pop();
  }

  const title = rest.join(" ").trim();
  if (!title) {
    return { ok: false, error: "Reminder text is required after the time." };
  }

  return {
    ok: true,
    value: {
      title,
      at: parsedTime.at,
      recurrence,
      targetToken,
    },
  };
}

export function parseAddTodoInput(
  args: string,
  now = new Date(),
): { ok: true; value: ParsedAddTodoInput } | { ok: false; error: string } {
  let remaining = args.trim();
  if (!remaining) {
    return { ok: false, error: "empty" };
  }

  let dueAt: Date | null = null;
  const dueSep = remaining.lastIndexOf(" @ ");
  if (dueSep >= 0) {
    const timePart = remaining.slice(dueSep + 3).trim();
    const timeTokens = timePart.split(/\s+/).filter(Boolean);
    const parsedTime = parseDateTimeTokens(timeTokens, now);
    if (!parsedTime || parsedTime.consumed !== timeTokens.length) {
      return {
        ok: false,
        error:
          "Could not parse the due time after @.\nExample: /addtodo #shopping Buy milk @ tomorrow 09:00",
      };
    }
    dueAt = parsedTime.at;
    remaining = remaining.slice(0, dueSep).trim();
  }

  let listSlug: string | null = null;
  const hashMatch = remaining.match(/^#(\S+)\s+(.+)$/);
  if (remaining.startsWith("#") && !hashMatch) {
    return {
      ok: false,
      error: "Use #list before the title.\nExample: /addtodo #shopping Buy milk",
    };
  }
  if (hashMatch) {
    const slug = normalizeListSlug(hashMatch[1]);
    if (!slug) {
      return { ok: false, error: "List name must be letters, numbers, or dashes." };
    }
    listSlug = slug;
    remaining = hashMatch[2].trim();
  }

  if (!remaining) {
    return { ok: false, error: "Todo title is required." };
  }

  return { ok: true, value: { listSlug, title: remaining, dueAt } };
}

export function normalizeListSlug(input: string): string | null {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[#_]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug || slug.length > 32) return null;
  return slug;
}

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function nextOccurrence(from: Date, recurrence: Recurrence): Date {
  if (recurrence === "daily") return addUtcHours(from, 24);
  if (recurrence === "weekly") return addUtcHours(from, 24 * 7);

  let next = addUtcHours(from, 24);
  while (isWeekendInPhnomPenh(next)) {
    next = addUtcHours(next, 24);
  }
  return next;
}

export function bumpUntilFuture(
  from: Date,
  recurrence: Recurrence,
  now = new Date(),
): Date {
  let next = nextOccurrence(from, recurrence);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 400) {
    next = nextOccurrence(next, recurrence);
    guard += 1;
  }
  return next;
}

export function formatLocalDateTime(date: Date, now = new Date()): string {
  const dateStr = todayInPhnomPenh(date);
  const today = todayInPhnomPenh(now);
  const tomorrow = addDaysToDateString(today, 1);
  const clock = formatLocalClock(date);

  if (dateStr === today) return `today ${clock}`;
  if (dateStr === tomorrow) return `tomorrow ${clock}`;
  return `${dateStr} ${clock}`;
}

export function formatLocalClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REMINDER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function startOfDayInPhnomPenh(date = new Date()): Date {
  return phnomPenhDateTimeToUtc(todayInPhnomPenh(date), 0, 0);
}

export function endOfDayInPhnomPenh(date = new Date()): Date {
  return phnomPenhDateTimeToUtc(todayInPhnomPenh(date), 23, 59);
}

function addUtcHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
