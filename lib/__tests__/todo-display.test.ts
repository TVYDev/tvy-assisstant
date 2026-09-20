import { describe, expect, it } from "vitest";
import {
  applyTodoDone,
  formatHeadingDate,
  formatTodoDueMeta,
  listDotColor,
  removeTodo,
  resolveTodoSwipe,
} from "../mini-app/todo-display";
import type { TodoRecord } from "../todos";

function todo(partial: Partial<TodoRecord> & Pick<TodoRecord, "id" | "title">): TodoRecord {
  return {
    list_id: 1,
    list_slug: "inbox",
    list_title: "Inbox",
    done: false,
    due_at: null,
    reminder_id: null,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...partial,
  };
}

describe("todo display", () => {
  it("keeps inbox dots gray and other lists colored", () => {
    expect(listDotColor("inbox")).toBe("#8e8e93");
    expect(listDotColor("shopping")).not.toBe("#8e8e93");
  });

  it("formats the heading date like 20 sep.", () => {
    expect(formatHeadingDate(new Date("2026-09-20T05:00:00.000Z"))).toMatch(
      /^\d{1,2} [a-z]{3,}\.$/,
    );
  });

  it("marks past due dates overdue", () => {
    const meta = formatTodoDueMeta(
      "2026-09-18T02:00:00.000Z",
      new Date("2026-09-20T02:00:00.000Z"),
    );
    expect(meta?.overdue).toBe(true);
    expect(meta?.label).toContain("overdue");
  });

  it("moves a todo from open to done without dropping it", () => {
    const items = {
      open: [todo({ id: 1, title: "Milk" })],
      doneToday: [] as TodoRecord[],
      done: [] as TodoRecord[],
    };
    const next = applyTodoDone(items, 1, true);
    expect(next.open).toHaveLength(0);
    expect(next.done).toHaveLength(0);
    expect(next.doneToday[0]?.done).toBe(true);
    expect(applyTodoDone(next, 1, false).open[0]?.done).toBe(false);
  });

  it("removes a todo from every bucket", () => {
    const items = {
      open: [todo({ id: 1, title: "Milk" })],
      doneToday: [todo({ id: 2, title: "Eggs", done: true })],
      done: [todo({ id: 3, title: "Bread", done: true })],
    };
    expect(removeTodo(items, 2).doneToday).toHaveLength(0);
    expect(removeTodo(items, 1).open).toHaveLength(0);
  });

  it("maps swipe distance to done or delete", () => {
    expect(resolveTodoSwipe(72, true)).toBe("toggle");
    expect(resolveTodoSwipe(-72, true)).toBe("delete");
    expect(resolveTodoSwipe(-72, false)).toBeNull();
    expect(resolveTodoSwipe(20, true)).toBeNull();
  });
});
