import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindReminder, mockFindReminders, mockFindUser, mockInsert, mockUpdate } =
  vi.hoisted(() => ({
    mockFindReminder: vi.fn(),
    mockFindReminders: vi.fn(),
    mockFindUser: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
  }));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    query: {
      reminders: { findFirst: mockFindReminder, findMany: mockFindReminders },
      telegramUsers: { findFirst: mockFindUser },
    },
  }),
}));

import {
  addReminder,
  cancelReminder,
  claimDueReminders,
  resolveTargetChatId,
} from "../reminders";

const NOW = new Date("2026-09-19T04:30:00.000Z");

function insertReturning(row: Record<string, unknown>) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([row]),
    }),
  };
}

function updateReturning(rows: Record<string, unknown>[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addReminder", () => {
  it("inserts a pending reminder", async () => {
    mockInsert.mockReturnValue(
      insertReturning({
        id: 1,
        title: "Call dentist",
        remindAt: "2026-09-20T08:00:00.000Z",
        recurrence: null,
        targetChatId: 99,
        status: "pending",
        todoId: null,
        lastSentAt: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }),
    );

    const reminder = await addReminder({
      title: "Call dentist",
      remindAt: new Date("2026-09-20T08:00:00.000Z"),
      targetChatId: 99,
    });
    expect(reminder.status).toBe("pending");
    expect(reminder.target_chat_id).toBe(99);
  });
});

describe("claimDueReminders", () => {
  it("marks one-shot reminders sent", async () => {
    const claimed = {
      id: 2,
      title: "One shot",
      remindAt: "2026-09-19T04:00:00.000Z",
      recurrence: null,
      targetChatId: 99,
      status: "sent",
      todoId: null,
      lastSentAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    mockUpdate.mockReturnValue(updateReturning([claimed]));

    const rows = await claimDueReminders(NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("bumps recurring reminders and keeps them pending", async () => {
    const claimed = {
      id: 3,
      title: "Gym",
      remindAt: "2026-09-19T01:00:00.000Z",
      recurrence: "daily",
      targetChatId: 99,
      status: "sent",
      todoId: null,
      lastSentAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    mockUpdate
      .mockReturnValueOnce(updateReturning([claimed]))
      .mockReturnValueOnce(updateReturning([]));

    const rows = await claimDueReminders(NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Gym");
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not double-claim when nothing is due", async () => {
    mockUpdate.mockReturnValue(updateReturning([]));
    const rows = await claimDueReminders(NOW);
    expect(rows).toEqual([]);
  });
});

describe("cancelReminder", () => {
  it("cancels a pending reminder", async () => {
    mockUpdate.mockReturnValue(
      updateReturning([
        {
          id: 4,
          title: "Nope",
          remindAt: "2026-09-20T01:00:00.000Z",
          recurrence: null,
          targetChatId: 99,
          status: "cancelled",
          todoId: null,
          lastSentAt: null,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ]),
    );
    const reminder = await cancelReminder(4);
    expect(reminder?.status).toBe("cancelled");
  });
});

describe("resolveTargetChatId", () => {
  it("defaults me to the owner", async () => {
    const result = await resolveTargetChatId({
      token: null,
      ownerId: 111,
      currentChatId: 222,
    });
    expect(result).toEqual({ ok: true, chatId: 111 });
  });

  it("uses the current chat for here", async () => {
    const result = await resolveTargetChatId({
      token: "here",
      ownerId: 111,
      currentChatId: 222,
    });
    expect(result).toEqual({ ok: true, chatId: 222 });
  });

  it("looks up a shortcode", async () => {
    mockFindUser.mockResolvedValue({ telegramUserId: 555 });
    const result = await resolveTargetChatId({
      token: "BSR",
      ownerId: 111,
      currentChatId: 222,
    });
    expect(result).toEqual({ ok: true, chatId: 555 });
  });

  it("errors when the user has no telegram id", async () => {
    mockFindUser.mockResolvedValue({ telegramUserId: null });
    const result = await resolveTargetChatId({
      token: "BSR",
      ownerId: 111,
      currentChatId: 222,
    });
    expect(result.ok).toBe(false);
  });
});
