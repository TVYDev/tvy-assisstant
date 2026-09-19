import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockFindSession,
  mockInsert,
  mockDelete,
  mockCancelFit,
  mockAddTodo,
  mockListTodoLists,
  mockAddReminder,
  mockResolveTarget,
} = vi.hoisted(() => ({
  mockFindSession: vi.fn(),
  mockInsert: vi.fn(),
  mockDelete: vi.fn(),
  mockCancelFit: vi.fn(),
  mockAddTodo: vi.fn(),
  mockListTodoLists: vi.fn(),
  mockAddReminder: vi.fn(),
  mockResolveTarget: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: mockInsert,
    delete: mockDelete,
    query: {
      taskWizardSessions: { findFirst: mockFindSession },
    },
  }),
}));

vi.mock("../fitness-log", () => ({
  cancelSession: mockCancelFit,
}));

vi.mock("../todos", () => ({
  addTodo: mockAddTodo,
  listTodoLists: mockListTodoLists,
}));

vi.mock("../reminders", () => ({
  addReminder: mockAddReminder,
  resolveTargetChatId: mockResolveTarget,
}));

import {
  advanceTaskWizard,
  startTaskWizard,
} from "../task-wizard";

const NOW = new Date("2026-09-19T04:00:00.000Z");
const OWNER = 42;
const CONTEXT = { ownerId: OWNER, chatId: OWNER };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    telegramUserId: OWNER,
    kind: "todo",
    step: "list",
    payload: "{}",
    expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockCancelFit.mockResolvedValue(undefined);
  mockListTodoLists.mockResolvedValue([
    { slug: "inbox", title: "Inbox", open_count: 0 },
  ]);
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startTaskWizard", () => {
  it("starts the todo list picker and cancels a fitness session", async () => {
    const result = await startTaskWizard(OWNER, "todo");
    expect(mockCancelFit).toHaveBeenCalledWith(OWNER);
    expect(result.done).toBe(false);
    expect(result.reply).toContain("pick a list");
    expect(result.keyboard?.flat().some((btn) => btn.text === "Inbox")).toBe(
      true,
    );
  });

  it("starts the reminder wizard on the title step", async () => {
    const result = await startTaskWizard(OWNER, "reminder");
    expect(result.reply).toContain("what should I remind you about");
  });
});

describe("todo wizard", () => {
  it("saves without a reminder when due is skipped", async () => {
    mockFindSession.mockResolvedValue(
      sessionRow({
        step: "due",
        payload: JSON.stringify({ list_slug: "inbox", title: "Buy milk" }),
      }),
    );
    mockAddTodo.mockResolvedValue({
      id: 7,
      list_slug: "inbox",
      title: "Buy milk",
    });

    const result = await advanceTaskWizard(OWNER, "due:skip", CONTEXT, NOW);
    expect(mockAddTodo).toHaveBeenCalledWith({
      title: "Buy milk",
      listSlug: "inbox",
      dueAt: null,
      remindChatId: OWNER,
    });
    expect(result.done).toBe(true);
    expect(result.reply).toContain("#7");
  });

  it("accepts a time chip after Today", async () => {
    mockFindSession.mockResolvedValue(
      sessionRow({
        step: "time",
        payload: JSON.stringify({
          list_slug: "shopping",
          title: "Eggs",
          due_date: "2026-09-20",
        }),
      }),
    );
    mockAddTodo.mockResolvedValue({
      id: 8,
      list_slug: "shopping",
      title: "Eggs",
    });

    const result = await advanceTaskWizard(OWNER, "clock:0900", CONTEXT, NOW);
    expect(mockAddTodo).toHaveBeenCalled();
    const dueAt = mockAddTodo.mock.calls[0][0].dueAt as Date;
    expect(dueAt.toISOString()).toBe("2026-09-20T02:00:00.000Z");
    expect(result.done).toBe(true);
  });

  it("accepts a typed HH:mm", async () => {
    mockFindSession.mockResolvedValue(
      sessionRow({
        step: "time",
        payload: JSON.stringify({
          list_slug: "inbox",
          title: "Call",
          due_date: "2026-09-20",
        }),
      }),
    );
    mockAddTodo.mockResolvedValue({
      id: 9,
      list_slug: "inbox",
      title: "Call",
    });

    const result = await advanceTaskWizard(OWNER, "15:30", CONTEXT, NOW);
    expect(result.done).toBe(true);
    const dueAt = mockAddTodo.mock.calls[0][0].dueAt as Date;
    expect(dueAt.toISOString()).toBe("2026-09-20T08:30:00.000Z");
  });

  it("keeps Today plus a past clock instead of rolling to tomorrow", async () => {
    mockFindSession.mockResolvedValue(
      sessionRow({
        step: "time",
        payload: JSON.stringify({
          list_slug: "inbox",
          title: "Gym",
          due_date: "2026-09-19",
        }),
      }),
    );
    mockAddTodo.mockResolvedValue({
      id: 11,
      list_slug: "inbox",
      title: "Gym",
    });

    const result = await advanceTaskWizard(OWNER, "clock:0900", CONTEXT, NOW);
    const dueAt = mockAddTodo.mock.calls[0][0].dueAt as Date;
    expect(dueAt.toISOString()).toBe("2026-09-19T02:00:00.000Z");
    expect(result.reply).toContain("today 09:00");
    expect(result.reply).not.toContain("tomorrow");
    expect(result.reply).toContain("already passed");
  });
});

describe("reminder wizard", () => {
  it("finishes after choosing Me", async () => {
    mockFindSession.mockResolvedValue(
      sessionRow({
        kind: "reminder",
        step: "who",
        payload: JSON.stringify({
          title: "Standup",
          due_date: "2026-09-20",
          due_clock: "09:00",
          recurrence: "weekdays",
        }),
      }),
    );
    mockResolveTarget.mockResolvedValue({ ok: true, chatId: OWNER });
    mockAddReminder.mockResolvedValue({
      id: 10,
      title: "Standup",
      recurrence: "weekdays",
    });

    const result = await advanceTaskWizard(OWNER, "who:me", CONTEXT, NOW);
    expect(mockAddReminder).toHaveBeenCalled();
    expect(result.done).toBe(true);
    expect(result.reply).toContain("#10");
  });
});
