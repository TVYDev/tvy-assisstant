import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: mockFrom,
  },
}));

import {
  parseWeightKg,
  parseYesNo,
  parseGymOutcome,
  parseGymSession,
  parseGymSessionInput,
  parseGymMinutes,
  parseFitnessLogCallback,
  buildGymKeyboard,
  buildSessionKeyboard,
  buildMinutesKeyboard,
  todayInPhnomPenh,
  startSession,
  getSession,
  cancelSession,
  advanceSession,
  submitQuickLog,
  parseQuickLogInput,
  splitFitCommandArgs,
  parseLogDateInput,
  validateLogDate,
  buildGymActivityMap,
  formatGymActivityGrid,
  addDaysToDateString,
  formatLogConfirmation,
  formatLogHistory,
  buildMorningReminderMessage,
  parseGymMotivationReminderEnabled,
  isWeekdayInPhnomPenh,
  buildGymMotivationMessage,
  formatGymMotivationReminderStatus,
} from "../fitness-log";

const TEST_TODAY = "2026-06-14";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeChain(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    data: null,
    error: null,
    ...overrides,
  };
  const q: Record<string, unknown> = {};
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.gte = vi.fn().mockReturnValue(q);
  q.order = vi.fn().mockReturnValue(q);
  q.upsert = vi.fn().mockReturnValue(q);
  q.update = vi.fn().mockReturnValue(q);
  q.delete = vi.fn().mockReturnValue(q);
  q.single = vi.fn().mockResolvedValue(base);
  q.maybeSingle = vi.fn().mockResolvedValue(base);
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(base).then(resolve);
  return q;
}

describe("validation helpers", () => {
  it("parseWeightKg accepts valid weights", () => {
    expect(parseWeightKg("75.5")).toBe(75.5);
    expect(parseWeightKg("75,5")).toBe(75.5);
  });

  it("parseWeightKg rejects invalid weights", () => {
    expect(parseWeightKg("0")).toBeNull();
    expect(parseWeightKg("abc")).toBeNull();
    expect(parseWeightKg("500")).toBeNull();
  });

  it("parseYesNo accepts yes as gym", () => {
    expect(parseYesNo("yes")).toBe(true);
    expect(parseYesNo("Y")).toBe(true);
  });

  it("parseYesNo treats rest and skip as not gym", () => {
    expect(parseYesNo("rest")).toBe(false);
    expect(parseYesNo("skip")).toBe(false);
  });

  it("parseYesNo rejects invalid answers", () => {
    expect(parseYesNo("maybe")).toBeNull();
    expect(parseYesNo("no")).toBeNull();
  });

  it("parseGymOutcome accepts gym, rest, and skip", () => {
    expect(parseGymOutcome("yes")).toBe("gym");
    expect(parseGymOutcome("rest day")).toBe("rest");
    expect(parseGymOutcome("skip")).toBe("skip");
  });

  it("parseGymSession accepts valid sessions", () => {
    expect(parseGymSession("chest")).toBe("chest");
    expect(parseGymSession("CARDIO")).toBe("cardio");
  });

  it("parseGymSession rejects non-preset sessions", () => {
    expect(parseGymSession("arms")).toBeNull();
  });

  it("parseGymSessionInput accepts custom sessions", () => {
    expect(parseGymSessionInput("full body")).toBe("full body");
    expect(parseGymSessionInput("arms")).toBe("arms");
  });

  it("parseGymSessionInput rejects empty or overly long sessions", () => {
    expect(parseGymSessionInput("   ")).toBeNull();
    expect(parseGymSessionInput("a".repeat(51))).toBeNull();
  });

  it("parseGymMinutes accepts valid minutes", () => {
    expect(parseGymMinutes("45")).toBe(45);
  });

  it("parseGymMinutes rejects invalid minutes", () => {
    expect(parseGymMinutes("0")).toBeNull();
    expect(parseGymMinutes("601")).toBeNull();
    expect(parseGymMinutes("abc")).toBeNull();
  });
});

describe("parseQuickLogInput", () => {
  it("parses rest day logs", () => {
    expect(parseQuickLogInput("75.5 rest", TEST_TODAY)).toEqual({
      ok: true,
      log_date: TEST_TODAY,
      weight_kg: 75.5,
      gym_status: "rest",
      gym_session: null,
      gym_minutes: null,
    });
  });

  it("parses skip logs", () => {
    expect(parseQuickLogInput("75.5 skip", TEST_TODAY)).toEqual({
      ok: true,
      log_date: TEST_TODAY,
      weight_kg: 75.5,
      gym_status: "skip",
      gym_session: null,
      gym_minutes: null,
    });
  });

  it("parses gym logs with preset session", () => {
    expect(parseQuickLogInput("75.5 yes chest 45", TEST_TODAY)).toEqual({
      ok: true,
      log_date: TEST_TODAY,
      weight_kg: 75.5,
      gym_status: "gym",
      gym_session: "chest",
      gym_minutes: 45,
    });
  });

  it("parses gym logs with multi-word custom session", () => {
    expect(parseQuickLogInput("75.5 yes full body 60", TEST_TODAY)).toEqual({
      ok: true,
      log_date: TEST_TODAY,
      weight_kg: 75.5,
      gym_status: "gym",
      gym_session: "full body",
      gym_minutes: 60,
    });
  });

  it("parses backdated quick logs", () => {
    expect(parseQuickLogInput("2026-06-12 75.5 rest", TEST_TODAY)).toEqual({
      ok: true,
      log_date: "2026-06-12",
      weight_kg: 75.5,
      gym_status: "rest",
      gym_session: null,
      gym_minutes: null,
    });
  });

  it("rejects invalid quick log input", () => {
    expect(parseQuickLogInput("75.5 maybe", TEST_TODAY)).toEqual({
      ok: false,
      error:
        "Second argument must be yes, rest, or skip.\nExample: /fit 75.5 rest",
    });
    expect(parseQuickLogInput("75.5 yes chest", TEST_TODAY)).toEqual({
      ok: false,
      error:
        "Gym days need session and minutes.\nExample: /fit 75.5 yes chest 45",
    });
    expect(parseQuickLogInput("2026-06-15 75.5 rest", TEST_TODAY)).toEqual({
      ok: false,
      error: "Log date cannot be in the future.",
    });
  });
});

describe("splitFitCommandArgs", () => {
  it("splits optional backdate prefix from quick args", () => {
    expect(splitFitCommandArgs("2026-06-12 75.5 rest", TEST_TODAY)).toEqual({
      ok: true,
      logDate: "2026-06-12",
      rest: "75.5 rest",
    });
    expect(splitFitCommandArgs("75.5 rest", TEST_TODAY)).toEqual({
      ok: true,
      logDate: TEST_TODAY,
      rest: "75.5 rest",
    });
    expect(splitFitCommandArgs("2026-06-12", TEST_TODAY)).toEqual({
      ok: true,
      logDate: "2026-06-12",
      rest: "",
    });
  });
});

describe("submitQuickLog", () => {
  it("saves a quick rest-day log", async () => {
    const existingChain = makeChain({ data: null, error: null });
    const upsertChain = makeChain({
      data: {
        log_date: "2026-06-14",
        weight_kg: 75.5,
        gym_status: "rest",
        gym_session: null,
        gym_minutes: null,
      },
      error: null,
    });
    const deleteChain = makeChain();

    mockFrom
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(deleteChain);

    const result = await submitQuickLog(12345, "75.5 rest");

    expect(result.done).toBe(true);
    expect(result.reply).toContain("Logged for today");
    expect(result.reply).toContain("rest day");
  });
});

describe("fitness log keyboards", () => {
  it("buildGymKeyboard includes yes, rest day, and skip", () => {
    const keyboard = buildGymKeyboard();
    expect(keyboard[0]).toEqual([
      { text: "Yes", callback_data: "fl:g:yes" },
    ]);
    expect(keyboard[1]).toEqual([
      { text: "Rest day", callback_data: "fl:g:rest" },
      { text: "Skip", callback_data: "fl:g:skip" },
    ]);
  });

  it("buildSessionKeyboard includes all preset sessions", () => {
    const keyboard = buildSessionKeyboard().flat();
    const sessions = keyboard.map((button) => button.callback_data);
    expect(sessions).toContain("fl:s:chest");
    expect(sessions).toContain("fl:s:cardio");
  });

  it("buildMinutesKeyboard includes preset durations", () => {
    const keyboard = buildMinutesKeyboard()[0].map((button) => button.text);
    expect(keyboard).toEqual(["30 min", "45 min", "60 min"]);
  });

  it("parseFitnessLogCallback maps button data to session input", () => {
    expect(parseFitnessLogCallback("fl:g:yes")).toBe("yes");
    expect(parseFitnessLogCallback("fl:g:rest")).toBe("rest");
    expect(parseFitnessLogCallback("fl:g:skip")).toBe("skip");
    expect(parseFitnessLogCallback("fl:s:chest")).toBe("chest");
    expect(parseFitnessLogCallback("fl:m:45")).toBe("45");
    expect(parseFitnessLogCallback("fl:x:nope")).toBeNull();
  });
});

describe("todayInPhnomPenh", () => {
  it("returns YYYY-MM-DD format", () => {
    const value = todayInPhnomPenh(new Date("2026-06-14T01:00:00.000Z"));
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("startSession", () => {
  it("creates a weight step session", async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain);

    const result = await startSession(12345);

    expect(mockFrom).toHaveBeenCalledWith("fitness_log_sessions");
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_user_id: 12345,
        step: "weight",
      }),
      { onConflict: "telegram_user_id" },
    );
    expect(result.reply).toContain("weight");
  });
});

describe("getSession", () => {
  it("returns null when no session exists", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }));

    const session = await getSession(12345);
    expect(session).toBeNull();
  });

  it("deletes expired sessions", async () => {
    const deleteChain = makeChain();
    const selectChain = makeChain({
      data: {
        telegram_user_id: 12345,
        step: "weight",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain);

    const session = await getSession(12345);
    expect(session).toBeNull();
    expect(deleteChain.delete).toHaveBeenCalled();
  });
});

describe("advanceSession", () => {
  it("prompts for gym after valid weight", async () => {
    const sessionChain = makeChain({
      data: {
        telegram_user_id: 12345,
        step: "weight",
        weight_kg: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    const updateChain = makeChain();

    mockFrom
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(updateChain);

    const result = await advanceSession(12345, "75.5");

    expect(result.done).toBe(false);
    expect(result.reply).toContain("gym yesterday");
    expect(result.keyboard).toEqual(buildGymKeyboard());
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ step: "gym", weight_kg: 75.5 }),
    );
  });

  it("saves rest day after gym=rest", async () => {
    const sessionChain = makeChain({
      data: {
        telegram_user_id: 12345,
        step: "gym",
        weight_kg: 75.5,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    const existingChain = makeChain({ data: null, error: null });
    const upsertChain = makeChain({
      data: {
        log_date: "2026-06-14",
        weight_kg: 75.5,
        gym_status: "rest",
        gym_session: null,
        gym_minutes: null,
      },
      error: null,
    });
    const deleteChain = makeChain();

    mockFrom
      .mockReturnValueOnce(sessionChain)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(deleteChain);

    const result = await advanceSession(12345, "rest");

    expect(result.done).toBe(true);
    expect(result.reply).toContain("Logged for today");
    expect(result.reply).toContain("rest day");
  });

  it("walks through gym day flow", async () => {
    const sessionAtGym = makeChain({
      data: {
        telegram_user_id: 12345,
        step: "gym",
        weight_kg: 75.5,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    const updateToSession = makeChain();

    mockFrom
      .mockReturnValueOnce(sessionAtGym)
      .mockReturnValueOnce(updateToSession);

    const yesResult = await advanceSession(12345, "yes");
    expect(yesResult.done).toBe(false);
    expect(yesResult.reply).toContain("Tap a button");
    expect(yesResult.keyboard).toEqual(buildSessionKeyboard());

    const sessionAtSession = makeChain({
      data: {
        telegram_user_id: 12345,
        step: "session",
        weight_kg: 75.5,
        gym_status: "gym",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    const updateToMinutes = makeChain();

    mockFrom
      .mockReturnValueOnce(sessionAtSession)
      .mockReturnValueOnce(updateToMinutes);

    const sessionResult = await advanceSession(12345, "chest");
    expect(sessionResult.done).toBe(false);
    expect(sessionResult.reply).toContain("minutes");
    expect(sessionResult.keyboard).toEqual(buildMinutesKeyboard());

    const sessionAtMinutes = makeChain({
      data: {
        telegram_user_id: 12345,
        step: "minutes",
        weight_kg: 75.5,
        gym_status: "gym",
        gym_session: "chest",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });
    const existingChain = makeChain({ data: null, error: null });
    const upsertChain = makeChain({
      data: {
        log_date: "2026-06-14",
        weight_kg: 75.5,
        gym_status: "gym",
        gym_session: "chest",
        gym_minutes: 45,
      },
      error: null,
    });
    const deleteChain = makeChain();

    mockFrom
      .mockReturnValueOnce(sessionAtMinutes)
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce(deleteChain);

    const doneResult = await advanceSession(12345, "45");
    expect(doneResult.done).toBe(true);
    expect(doneResult.reply).toContain("45 min chest");
  });
});

describe("cancelSession", () => {
  it("deletes the session row", async () => {
    const chain = makeChain();
    mockFrom.mockReturnValue(chain);

    await cancelSession(12345);

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("telegram_user_id", 12345);
  });
});

describe("formatters", () => {
  it("buildGymActivityMap maps gym_status to the prior calendar day", () => {
    const map = buildGymActivityMap([
      {
        id: 1,
        log_date: "2026-06-14",
        weight_kg: 75.5,
        gym_status: "gym",
        gym_session: "chest",
        gym_minutes: 45,
      },
      {
        id: 2,
        log_date: "2026-06-15",
        weight_kg: 75.2,
        gym_status: "skip",
        gym_session: null,
        gym_minutes: null,
      },
    ]);

    expect(map.get("2026-06-13")).toBe("gym");
    expect(map.get("2026-06-14")).toBe("skip");
  });

  it("formatGymActivityGrid renders a github-style dot grid", () => {
    const message = formatGymActivityGrid(
      [
        {
          id: 1,
          log_date: "2026-06-08",
          weight_kg: 75,
          gym_status: "gym",
          gym_session: "chest",
          gym_minutes: 45,
        },
        {
          id: 2,
          log_date: "2026-06-09",
          weight_kg: 75,
          gym_status: "rest",
          gym_session: null,
          gym_minutes: null,
        },
      ],
      7,
      "2026-06-09",
    );

    expect(message).toContain("🟩 gym");
    expect(message).toContain("⬜ rest");
    expect(message).toContain("🟧 skip");
    expect(message).toContain("⬛ no log");
    expect(message).toContain("<pre>Sun");
    expect(message).toContain("Gym 1 · Rest 1");
  });

  it("addDaysToDateString shifts calendar dates", () => {
    expect(addDaysToDateString("2026-06-14", -1)).toBe("2026-06-13");
  });

  it("formatLogConfirmation shows update message", () => {
    const message = formatLogConfirmation(
      {
        id: 1,
        log_date: "2026-06-14",
        weight_kg: 75.5,
        gym_status: "gym",
        gym_session: "chest",
        gym_minutes: 45,
      },
      true,
    );

    expect(message).toContain("Updated log for");
    expect(message).toContain("45 min chest");
    expect(message).toContain("75.50 kg");
  });

  it("formatLogHistory renders grid and recent logs", () => {
    const message = formatLogHistory(
      [
        {
          id: 1,
          log_date: "2026-06-14",
          weight_kg: 75.5,
          gym_status: "rest",
          gym_session: null,
          gym_minutes: null,
        },
      ],
      14,
      "2026-06-14",
    );

    expect(message).toContain("Gym activity");
    expect(message).toContain("Recent logs");
    expect(message).toContain("2026-06-14");
    expect(message).toContain("75.50 kg");
    expect(message).toContain("rest day");
  });

  it("formatLogHistory handles empty history", () => {
    expect(formatLogHistory([], 14)).toContain("No fitness logs");
  });

  it("buildMorningReminderMessage prompts /fit", () => {
    expect(buildMorningReminderMessage()).toContain("/fit");
  });

  it("parseGymMotivationReminderEnabled reads config values", () => {
    expect(parseGymMotivationReminderEnabled("true")).toBe(true);
    expect(parseGymMotivationReminderEnabled("false")).toBe(false);
  });

  it("isWeekdayInPhnomPenh excludes weekends", () => {
    expect(isWeekdayInPhnomPenh(new Date("2026-06-15T10:00:00.000Z"))).toBe(
      true,
    );
    expect(isWeekdayInPhnomPenh(new Date("2026-06-14T10:00:00.000Z"))).toBe(
      false,
    );
  });

  it("buildGymMotivationMessage returns motivational text", () => {
    expect(buildGymMotivationMessage().length).toBeGreaterThan(20);
  });

  it("formatGymMotivationReminderStatus reflects toggle state", () => {
    expect(formatGymMotivationReminderStatus(true)).toContain("ON");
    expect(formatGymMotivationReminderStatus(false)).toContain("OFF");
  });
});
