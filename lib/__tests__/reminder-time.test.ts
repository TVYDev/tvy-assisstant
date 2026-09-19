import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  bumpUntilFuture,
  formatLocalDateTime,
  isTargetToken,
  nextOccurrence,
  normalizeListSlug,
  parseAddTodoInput,
  parseClockToken,
  parseDateTimeTokens,
  parseDateToken,
  parseRemindInput,
  todayInPhnomPenh,
} from "../reminder-time";

const NOW = new Date("2026-09-19T04:00:00.000Z"); // 11:00 in Phnom Penh

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("todayInPhnomPenh", () => {
  it("uses Asia/Phnom_Penh calendar date", () => {
    expect(todayInPhnomPenh(NOW)).toBe("2026-09-19");
  });
});

describe("parseClockToken", () => {
  it("accepts HH:mm", () => {
    expect(parseClockToken("09:00")).toEqual({ hour: 9, minute: 0 });
    expect(parseClockToken("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("rejects invalid clocks", () => {
    expect(parseClockToken("24:00")).toBeNull();
    expect(parseClockToken("9")).toBeNull();
  });
});

describe("parseDateTimeTokens", () => {
  it("rolls HH:mm to tomorrow when it already passed today", () => {
    const parsed = parseDateTimeTokens(["09:00"], NOW);
    expect(parsed).not.toBeNull();
    expect(parsed!.consumed).toBe(1);
    expect(todayInPhnomPenh(parsed!.at)).toBe("2026-09-20");
  });

  it("keeps HH:mm today when still in the future", () => {
    const parsed = parseDateTimeTokens(["15:00"], NOW);
    expect(parsed).not.toBeNull();
    expect(todayInPhnomPenh(parsed!.at)).toBe("2026-09-19");
  });

  it("parses tomorrow HH:mm", () => {
    const parsed = parseDateTimeTokens(["tomorrow", "15:00"], NOW);
    expect(parsed).not.toBeNull();
    expect(parsed!.consumed).toBe(2);
    expect(todayInPhnomPenh(parsed!.at)).toBe("2026-09-20");
  });

  it("parses YYYY-MM-DD HH:mm", () => {
    const parsed = parseDateTimeTokens(["2026-09-20", "09:00"], NOW);
    expect(parsed).not.toBeNull();
    expect(parsed!.at.toISOString()).toBe("2026-09-20T02:00:00.000Z");
  });
});

describe("parseRemindInput", () => {
  it("parses title after time", () => {
    const parsed = parseRemindInput("tomorrow 15:00 Call dentist", NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.title).toBe("Call dentist");
    expect(parsed.value.recurrence).toBeNull();
    expect(parsed.value.targetToken).toBeNull();
  });

  it("parses recurrence and target from the end", () => {
    const parsed = parseRemindInput("20:00 Call mom weekly BSR", NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.title).toBe("Call mom");
    expect(parsed.value.recurrence).toBe("weekly");
    expect(parsed.value.targetToken).toBe("BSR");
  });

  it("parses here as target", () => {
    const parsed = parseRemindInput("2026-09-20 09:00 Pay rent here", NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.title).toBe("Pay rent");
    expect(parsed.value.targetToken).toBe("here");
  });

  it("requires reminder text", () => {
    const parsed = parseRemindInput("09:00", NOW);
    expect(parsed.ok).toBe(false);
  });
});

describe("parseAddTodoInput", () => {
  it("defaults to inbox without a #list", () => {
    const parsed = parseAddTodoInput("Call mom", NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.listSlug).toBeNull();
    expect(parsed.value.title).toBe("Call mom");
    expect(parsed.value.dueAt).toBeNull();
  });

  it("does not treat the first word as a list without #", () => {
    const parsed = parseAddTodoInput("Call mom", NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.listSlug).toBeNull();
  });

  it("reads #shopping and a due time", () => {
    const parsed = parseAddTodoInput(
      "#shopping Buy milk @ tomorrow 09:00",
      NOW,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.listSlug).toBe("shopping");
    expect(parsed.value.title).toBe("Buy milk");
    expect(parsed.value.dueAt).not.toBeNull();
  });
});

describe("normalizeListSlug", () => {
  it("normalizes Shopping Cart", () => {
    expect(normalizeListSlug("Shopping Cart")).toBe("shopping-cart");
    expect(normalizeListSlug("#shopping")).toBe("shopping");
  });

  it("rejects empty slugs", () => {
    expect(normalizeListSlug("!!!")).toBeNull();
  });
});

describe("recurrence", () => {
  it("adds one day for daily", () => {
    const from = new Date("2026-09-19T02:00:00.000Z");
    const next = nextOccurrence(from, "daily");
    expect(next.toISOString()).toBe("2026-09-20T02:00:00.000Z");
  });

  it("skips the weekend for weekdays", () => {
    const friday = new Date("2026-09-18T02:00:00.000Z");
    const next = nextOccurrence(friday, "weekdays");
    expect(todayInPhnomPenh(next)).toBe("2026-09-21");
  });

  it("bumps overdue recurring times into the future", () => {
    const from = new Date("2026-09-10T02:00:00.000Z");
    const next = bumpUntilFuture(from, "daily", NOW);
    expect(next.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("formatLocalDateTime", () => {
  it("uses today/tomorrow labels", () => {
    const laterToday = new Date("2026-09-19T08:00:00.000Z");
    expect(formatLocalDateTime(laterToday, NOW)).toBe("today 15:00");
    const tomorrow = new Date("2026-09-20T02:00:00.000Z");
    expect(formatLocalDateTime(tomorrow, NOW)).toBe("tomorrow 09:00");
  });
});

describe("isTargetToken", () => {
  it("recognizes me, here, @user, chat ids, and shortcodes", () => {
    expect(isTargetToken("me")).toBe(true);
    expect(isTargetToken("here")).toBe(true);
    expect(isTargetToken("@vannyou")).toBe(true);
    expect(isTargetToken("-100123456")).toBe(true);
    expect(isTargetToken("BSR")).toBe(true);
    expect(isTargetToken("mom")).toBe(false);
  });
});

describe("parseDateToken", () => {
  it("rejects impossible dates", () => {
    expect(parseDateToken("2026-02-31", NOW)).toBeNull();
  });
});
