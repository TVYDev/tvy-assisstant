import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockFindList,
  mockFindLists,
  mockFindTodo,
  mockFindTodos,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockAddReminder,
  mockAttachReminder,
  mockCancelLinked,
} = vi.hoisted(() => ({
  mockFindList: vi.fn(),
  mockFindLists: vi.fn(),
  mockFindTodo: vi.fn(),
  mockFindTodos: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockAddReminder: vi.fn(),
  mockAttachReminder: vi.fn(),
  mockCancelLinked: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    query: {
      todoLists: { findFirst: mockFindList, findMany: mockFindLists },
      todos: { findFirst: mockFindTodo, findMany: mockFindTodos },
    },
  }),
}));

vi.mock("../reminders", () => ({
  addReminder: mockAddReminder,
  attachReminderToTodo: mockAttachReminder,
  cancelReminderForTodo: mockCancelLinked,
}));

import {
  addTodo,
  cancelTodo,
  formatTodosReply,
  getTodos,
  moveTodo,
  parseTodoListFilter,
  setTodoDone,
} from "../todos";

const NOW = new Date("2026-09-19T04:00:00.000Z");
const inbox = { id: 1, slug: "inbox", title: "Inbox" };
const shopping = { id: 2, slug: "shopping", title: "Shopping" };

function insertReturning(row: Record<string, unknown>) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([row]),
    }),
  };
}

function updateReturning(row: Record<string, unknown>) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([row]),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindList.mockResolvedValue(inbox);
  mockCancelLinked.mockResolvedValue(undefined);
  mockAttachReminder.mockResolvedValue(undefined);
});

describe("parseTodoListFilter", () => {
  it("reads today, all, and list slugs", () => {
    expect(parseTodoListFilter("today")).toBe("today");
    expect(parseTodoListFilter("")).toBe("all");
    expect(parseTodoListFilter("#shopping")).toEqual({ listSlug: "shopping" });
  });
});

describe("addTodo", () => {
  it("adds to inbox without a reminder", async () => {
    mockInsert.mockReturnValue(
      insertReturning({
        id: 3,
        listId: 1,
        title: "Call mom",
        done: false,
        dueAt: null,
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }),
    );

    const todo = await addTodo({ title: "Call mom" });
    expect(todo.list_slug).toBe("inbox");
    expect(todo.title).toBe("Call mom");
    expect(mockAddReminder).not.toHaveBeenCalled();
  });

  it("creates a linked reminder when due", async () => {
    mockFindList.mockResolvedValue(shopping);
    mockInsert.mockReturnValue(
      insertReturning({
        id: 4,
        listId: 2,
        title: "Buy milk",
        done: false,
        dueAt: "2026-09-20T02:00:00.000Z",
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }),
    );
    mockAddReminder.mockResolvedValue({ id: 9 });

    const dueAt = new Date("2026-09-20T02:00:00.000Z");
    const todo = await addTodo({
      title: "Buy milk",
      listSlug: "shopping",
      dueAt,
      remindChatId: 123,
    });

    expect(todo.list_slug).toBe("shopping");
    expect(mockAddReminder).toHaveBeenCalledWith({
      title: "Buy milk",
      remindAt: dueAt,
      targetChatId: 123,
      todoId: 4,
    });
    expect(mockAttachReminder).toHaveBeenCalledWith(4, 9);
  });
});

describe("getTodos today filter", () => {
  it("includes due-today and overdue, excludes future and undated", async () => {
    mockFindLists.mockResolvedValue([inbox]);
    mockFindTodos.mockResolvedValue([
      {
        id: 1,
        listId: 1,
        title: "Due today",
        done: false,
        dueAt: "2026-09-19T08:00:00.000Z",
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        list: inbox,
      },
      {
        id: 2,
        listId: 1,
        title: "Overdue",
        done: false,
        dueAt: "2026-09-18T02:00:00.000Z",
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        list: inbox,
      },
      {
        id: 3,
        listId: 1,
        title: "Future",
        done: false,
        dueAt: "2026-09-21T02:00:00.000Z",
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        list: inbox,
      },
      {
        id: 4,
        listId: 1,
        title: "Undated",
        done: false,
        dueAt: null,
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        list: inbox,
      },
    ]);

    const result = await getTodos("today", NOW);
    expect(result.open.map((item) => item.title)).toEqual([
      "Due today",
      "Overdue",
    ]);
  });
});

describe("formatTodosReply", () => {
  it("groups open todos under list headings", () => {
    const text = formatTodosReply(
      "all",
      {
        open: [
          {
            id: 1,
            list_id: 2,
            list_slug: "shopping",
            list_title: "Shopping",
            title: "Eggs",
            done: false,
            due_at: null,
            reminder_id: null,
            created_at: NOW.toISOString(),
            updated_at: NOW.toISOString(),
          },
          {
            id: 2,
            list_id: 1,
            list_slug: "inbox",
            list_title: "Inbox",
            title: "Email",
            done: false,
            due_at: null,
            reminder_id: null,
            created_at: NOW.toISOString(),
            updated_at: NOW.toISOString(),
          },
        ],
        doneToday: [],
      },
      NOW,
    );
    expect(text).toContain("inbox");
    expect(text.indexOf("inbox")).toBeLessThan(text.indexOf("shopping"));
    expect(text).toContain("#1 Eggs");
  });
});

describe("setTodoDone and cancelTodo", () => {
  const row = {
    id: 5,
    listId: 1,
    title: "Pack bag",
    done: false,
    dueAt: null,
    reminderId: 11,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    list: inbox,
  };

  it("cancels the linked reminder when marking done", async () => {
    mockFindTodo.mockResolvedValue(row);
    mockUpdate.mockReturnValue(
      updateReturning({ ...row, done: true, reminderId: null }),
    );

    const todo = await setTodoDone(5, true);
    expect(todo?.done).toBe(true);
    expect(mockCancelLinked).toHaveBeenCalledWith(5);
  });

  it("cancels the linked reminder when deleting", async () => {
    mockFindTodo.mockResolvedValue(row);
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const todo = await cancelTodo(5);
    expect(todo?.id).toBe(5);
    expect(mockCancelLinked).toHaveBeenCalledWith(5);
  });
});

describe("moveTodo", () => {
  it("moves an item to another list", async () => {
    mockFindTodo.mockResolvedValue({
      id: 6,
      listId: 1,
      title: "Milk",
      done: false,
      dueAt: null,
      reminderId: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      list: inbox,
    });
    mockFindList.mockResolvedValue(shopping);
    mockUpdate.mockReturnValue(
      updateReturning({
        id: 6,
        listId: 2,
        title: "Milk",
        done: false,
        dueAt: null,
        reminderId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      }),
    );

    const todo = await moveTodo(6, "shopping");
    expect(todo?.list_slug).toBe("shopping");
  });
});
