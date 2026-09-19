import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { todoLists, todos } from "./db/schema";
import {
  addReminder,
  attachReminderToTodo,
  cancelReminderForTodo,
} from "./reminders";
import {
  endOfDayInPhnomPenh,
  formatLocalDateTime,
  normalizeListSlug,
  parseAddTodoInput,
  startOfDayInPhnomPenh,
  titleFromSlug,
} from "./reminder-time";

export const INBOX_SLUG = "inbox";

export interface TodoListRecord {
  id: number;
  slug: string;
  title: string;
}

export interface TodoRecord {
  id: number;
  list_id: number;
  list_slug: string;
  list_title: string;
  title: string;
  done: boolean;
  due_at: string | null;
  reminder_id: number | null;
  created_at: string;
  updated_at: string;
}

export type TodoListFilter = "all" | "today" | { listSlug: string };

function dbError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${message}`);
}

function mapList(row: typeof todoLists.$inferSelect): TodoListRecord {
  return { id: row.id, slug: row.slug, title: row.title };
}

function mapTodo(
  row: typeof todos.$inferSelect,
  list: Pick<TodoListRecord, "slug" | "title">,
): TodoRecord {
  return {
    id: row.id,
    list_id: row.listId,
    list_slug: list.slug,
    list_title: list.title,
    title: row.title,
    done: row.done,
    due_at: row.dueAt,
    reminder_id: row.reminderId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function ensureInboxList(): Promise<TodoListRecord> {
  return getOrCreateList(INBOX_SLUG, "Inbox");
}

export async function getOrCreateList(
  slugInput: string,
  title?: string,
): Promise<TodoListRecord> {
  const slug = normalizeListSlug(slugInput);
  if (!slug) {
    throw new Error("List name must be letters, numbers, or dashes.");
  }

  try {
    const existing = await getDb().query.todoLists.findFirst({
      where: eq(todoLists.slug, slug),
    });
    if (existing) return mapList(existing);

    const [row] = await getDb()
      .insert(todoLists)
      .values({
        slug,
        title: title ?? titleFromSlug(slug),
        updatedAt: new Date().toISOString(),
      })
      .returning();
    return mapList(row);
  } catch (error) {
    throw dbError("Failed to create todo list", error);
  }
}

export async function createList(slugInput: string): Promise<TodoListRecord> {
  const slug = normalizeListSlug(slugInput);
  if (!slug) {
    throw new Error("List name must be letters, numbers, or dashes.");
  }

  try {
    const existing = await getDb().query.todoLists.findFirst({
      where: eq(todoLists.slug, slug),
    });
    if (existing) {
      throw new Error(`List #${slug} already exists.`);
    }
    return getOrCreateList(slug);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("List #")) {
      throw error;
    }
    throw dbError("Failed to create todo list", error);
  }
}

export async function listTodoLists(): Promise<
  Array<TodoListRecord & { open_count: number }>
> {
  await ensureInboxList();
  try {
    const lists = await getDb().query.todoLists.findMany({
      orderBy: (table, { asc: orderAsc }) => [orderAsc(table.slug)],
    });
    const openItems = await getDb().query.todos.findMany({
      where: eq(todos.done, false),
      columns: { listId: true },
    });
    const counts = new Map<number, number>();
    for (const item of openItems) {
      counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
    }

    return lists
      .map((list) => ({
        ...mapList(list),
        open_count: counts.get(list.id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.slug === INBOX_SLUG) return -1;
        if (b.slug === INBOX_SLUG) return 1;
        return a.title.localeCompare(b.title);
      });
  } catch (error) {
    throw dbError("Failed to list todo lists", error);
  }
}

export async function deleteList(slugInput: string): Promise<TodoListRecord> {
  const slug = normalizeListSlug(slugInput);
  if (!slug) {
    throw new Error("List name must be letters, numbers, or dashes.");
  }
  if (slug === INBOX_SLUG) {
    throw new Error("Inbox cannot be deleted.");
  }

  try {
    const list = await getDb().query.todoLists.findFirst({
      where: eq(todoLists.slug, slug),
    });
    if (!list) {
      throw new Error(`No list named ${slug}.`);
    }

    const remaining = await getDb().query.todos.findFirst({
      where: eq(todos.listId, list.id),
    });
    if (remaining) {
      throw new Error(`List #${slug} still has todos. Move or delete them first.`);
    }

    await getDb().delete(todoLists).where(eq(todoLists.id, list.id));
    return mapList(list);
  } catch (error) {
    if (error instanceof Error && /Inbox|No list|still has/.test(error.message)) {
      throw error;
    }
    throw dbError("Failed to delete todo list", error);
  }
}

export async function addTodo(input: {
  title: string;
  listSlug?: string | null;
  dueAt?: Date | null;
  remindChatId?: number;
}): Promise<TodoRecord> {
  const list = await getOrCreateList(input.listSlug ?? INBOX_SLUG);

  try {
    const [row] = await getDb()
      .insert(todos)
      .values({
        listId: list.id,
        title: input.title,
        dueAt: input.dueAt ? input.dueAt.toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .returning();

    let reminderId: number | null = null;
    if (input.dueAt && input.remindChatId) {
      const reminder = await addReminder({
        title: input.title,
        remindAt: input.dueAt,
        targetChatId: input.remindChatId,
        todoId: row.id,
      });
      reminderId = reminder.id;
      await attachReminderToTodo(row.id, reminder.id);
    }

    return mapTodo({ ...row, reminderId }, list);
  } catch (error) {
    throw dbError("Failed to add todo", error);
  }
}

export async function getTodoById(id: number): Promise<TodoRecord | null> {
  try {
    const row = await getDb().query.todos.findFirst({
      where: eq(todos.id, id),
      with: { list: true },
    });
    if (!row?.list) return null;
    return mapTodo(row, row.list);
  } catch (error) {
    throw dbError("Failed to get todo", error);
  }
}

export async function getTodos(
  filter: TodoListFilter,
  now = new Date(),
): Promise<{ open: TodoRecord[]; doneToday: TodoRecord[] }> {
  await ensureInboxList();

  try {
    const rows = await getDb().query.todos.findMany({
      with: { list: true },
      orderBy: (table, { asc: orderAsc }) => [orderAsc(table.id)],
    });

    const mapped = rows
      .filter((row) => row.list)
      .map((row) => mapTodo(row, row.list));

    if (filter === "all") {
      return { open: mapped.filter((item) => !item.done), doneToday: [] };
    }

    if (filter !== "today") {
      const slug = normalizeListSlug(filter.listSlug);
      const open = mapped.filter(
        (item) => !item.done && item.list_slug === slug,
      );
      return { open, doneToday: [] };
    }

    const start = startOfDayInPhnomPenh(now);
    const end = endOfDayInPhnomPenh(now);
    const nextStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const open = mapped.filter((item) => {
      if (item.done || !item.due_at) return false;
      return new Date(item.due_at).getTime() <= end.getTime();
    });
    const doneToday = mapped.filter((item) => {
      if (!item.done) return false;
      const updated = new Date(item.updated_at);
      return updated >= start && updated < nextStart;
    });
    return { open, doneToday };
  } catch (error) {
    throw dbError("Failed to list todos", error);
  }
}

export async function setTodoDone(
  id: number,
  done: boolean,
): Promise<TodoRecord | null> {
  const existing = await getTodoById(id);
  if (!existing) return null;

  try {
    const [row] = await getDb()
      .update(todos)
      .set({ done, updatedAt: new Date().toISOString() })
      .where(eq(todos.id, id))
      .returning();

    if (done) {
      await cancelReminderForTodo(id);
    }

    return row ? mapTodo(row, existing) : null;
  } catch (error) {
    throw dbError("Failed to update todo", error);
  }
}

export async function cancelTodo(id: number): Promise<TodoRecord | null> {
  const existing = await getTodoById(id);
  if (!existing) return null;

  try {
    await cancelReminderForTodo(id);
    await getDb().delete(todos).where(eq(todos.id, id));
    return existing;
  } catch (error) {
    throw dbError("Failed to cancel todo", error);
  }
}

export async function moveTodo(
  id: number,
  listSlug: string,
): Promise<TodoRecord | null> {
  const existing = await getTodoById(id);
  if (!existing) return null;
  const list = await getOrCreateList(listSlug);

  try {
    const [row] = await getDb()
      .update(todos)
      .set({ listId: list.id, updatedAt: new Date().toISOString() })
      .where(eq(todos.id, id))
      .returning();
    return row ? mapTodo(row, list) : null;
  } catch (error) {
    throw dbError("Failed to move todo", error);
  }
}

export function parseTodoListFilter(raw: string | undefined): TodoListFilter {
  const value = raw?.trim() ?? "";
  if (!value || value.toLowerCase() === "all") return "all";
  if (value.toLowerCase() === "today") return "today";
  const slug = normalizeListSlug(value.startsWith("#") ? value.slice(1) : value);
  return { listSlug: slug ?? value.toLowerCase() };
}

export function formatTodoLists(
  lists: Array<TodoListRecord & { open_count: number }>,
): string {
  if (lists.length === 0) return "📋 No todo lists yet.";
  const lines = ["📋 Todo lists", ""];
  for (const list of lists) {
    lines.push(`${listEmoji(list.slug)} ${list.slug} — ${list.open_count} open`);
  }
  return lines.join("\n");
}

export function formatTodosReply(
  filter: TodoListFilter,
  result: { open: TodoRecord[]; doneToday: TodoRecord[] },
  now = new Date(),
): string {
  if (filter === "today") {
    return formatTodayTodos(result, now);
  }

  if (filter !== "all") {
    const slug = filter.listSlug;
    if (result.open.length === 0) {
      return `📋 No open todos in #${slug}.`;
    }
    const heading = `${listEmoji(slug)} ${slug} (${result.open.length})`;
    return [heading, "", ...result.open.map((item) => formatTodoLine(item, now, false))].join(
      "\n",
    );
  }

  if (result.open.length === 0) {
    return "📋 No open todos.\n\nTap Add todo or /addtodo to start a list.";
  }

  const grouped = new Map<string, TodoRecord[]>();
  for (const item of result.open) {
    const key = item.list_slug;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const slugs = [...grouped.keys()].sort((a, b) => {
    if (a === INBOX_SLUG) return -1;
    if (b === INBOX_SLUG) return 1;
    return a.localeCompare(b);
  });

  const sections: string[] = [];
  for (const slug of slugs) {
    const items = grouped.get(slug) ?? [];
    sections.push(
      `${listEmoji(slug)} ${slug} (${items.length})`,
      ...items.map((item) => formatTodoLine(item, now, false)),
    );
  }
  return sections.join("\n");
}

function formatTodayTodos(
  result: { open: TodoRecord[]; doneToday: TodoRecord[] },
  now: Date,
): string {
  const lines = [
    `📅 Today (${result.open.length} open)`,
    "",
  ];
  if (result.open.length === 0) {
    lines.push("Nothing due today. Nice. 🦕");
  } else {
    for (const item of result.open) {
      lines.push(formatTodoLine(item, now, true));
    }
  }
  if (result.doneToday.length > 0) {
    lines.push("", "Done today:");
    for (const item of result.doneToday) {
      lines.push(`✓ #${item.id} ${item.title} — ${item.list_slug}`);
    }
  }
  return lines.join("\n");
}

function formatTodoLine(item: TodoRecord, now: Date, includeList: boolean): string {
  const due = item.due_at
    ? ` — ${dueLabel(item.due_at, now)}`
    : "";
  const list = includeList ? ` — ${item.list_slug}` : "";
  return `#${item.id} ${item.title}${list}${due}`;
}

function dueLabel(dueAt: string, now: Date): string {
  const due = new Date(dueAt);
  if (due.getTime() < startOfDayInPhnomPenh(now).getTime()) {
    return `overdue (${formatLocalDateTime(due, now)})`;
  }
  return `due ${formatLocalDateTime(due, now)}`;
}

export function listEmoji(slug: string): string {
  if (slug === INBOX_SLUG) return "📥";
  if (slug === "shopping" || slug === "shopping-cart") return "🛒";
  return "📋";
}

export function parseAddTodoCommand(
  args: string,
  now = new Date(),
): ReturnType<typeof parseAddTodoInput> {
  return parseAddTodoInput(args, now);
}
