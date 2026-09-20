"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  addReminderAction,
  addTodoAction,
  cancelReminderAction,
  cancelTodoAction,
  createListAction,
  moveTodoAction,
  setTodoDoneAction,
} from "@/app/actions/mini";
import { ConfirmDialog } from "@/components/mini/confirm-dialog";
import { OwnerGuard } from "@/components/mini/owner-guard";
import { ErrorBanner, LoadingBlock } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import { ReminderComposer, TodoComposer } from "@/components/mini/todo-composer";
import { TodoItem } from "@/components/mini/todo-item";
import { TodoSidebar } from "@/components/mini/todo-sidebar";
import type { TasksView } from "@/components/mini/todo-types";
import {
  applyTodoDone,
  defaultTodayDueAt,
  formatHeadingDate,
  INBOX_SLUG,
  removeTodo,
} from "@/lib/mini-app/todo-display";
import type { getTasksPayload } from "@/lib/mini-app/queries";
import type { Recurrence } from "@/lib/reminder-time";
import type { TodoRecord } from "@/lib/todos";

type TasksPayload = Awaited<ReturnType<typeof getTasksPayload>>;
type SearchPayload = { results: TodoRecord[] };

function filterParam(view: TasksView): string {
  if (view.kind === "anytime" || view.kind === "reminders") return "open";
  if (view.kind === "list") return view.slug;
  return "today";
}

function headingFor(view: TasksView, lists: TasksPayload["lists"]): {
  title: string;
  subtitle?: string;
} {
  if (view.kind === "today") {
    return { title: "Today", subtitle: formatHeadingDate() };
  }
  if (view.kind === "anytime") return { title: "Anytime" };
  if (view.kind === "reminders") return { title: "Reminders" };
  const list = lists.find((item) => item.slug === view.slug);
  return { title: list?.title ?? view.slug };
}

export default function TasksPage() {
  const { initData, haptic } = useMiniApp();
  const [view, setView] = useState<TasksView>({ kind: "today" });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [listSlug, setListSlug] = useState(INBOX_SLUG);
  const [dueAt, setDueAt] = useState("");
  const [remind, setRemind] = useState(true);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [recurrence, setRecurrence] = useState<Recurrence | "none">("none");
  const [newList, setNewList] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const path = debouncedQuery
    ? `/api/mini/owner/tasks?q=${encodeURIComponent(debouncedQuery)}`
    : `/api/mini/owner/tasks?filter=${encodeURIComponent(filterParam(view))}`;
  const { data, error, loading, reload, setData } = useMiniGet<
    TasksPayload | SearchPayload
  >(path);

  const lists = data && "lists" in data ? data.lists : [];
  const todos = data && "todos" in data ? data.todos : null;
  const reminders = data && "reminders" in data ? data.reminders : [];
  const searchResults = data && "results" in data ? data.results : null;
  const heading = headingFor(view, lists);

  const openItems = searchResults?.filter((item) => !item.done) ?? todos?.open ?? [];
  const doneItems = searchResults
    ? searchResults.filter((item) => item.done)
    : todos
      ? [...todos.doneToday, ...todos.done]
      : [];

  async function run(
    action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
  ) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      haptic("error");
      setMessage(result.error);
      return false;
    }
    haptic("success");
    setMessage(null);
    await reload({ silent: true });
    return true;
  }

  async function toggleTodo(todo: TodoRecord) {
    const nextDone = !todo.done;
    setBusyId(todo.id);
    setData((current) => {
      if (!current) return current;
      if ("results" in current) {
        return {
          results: current.results.map((item) =>
            item.id === todo.id ? { ...item, done: nextDone } : item,
          ),
        };
      }
      return { ...current, todos: applyTodoDone(current.todos, todo.id, nextDone) };
    });
    const result = await setTodoDoneAction(initData, todo.id, nextDone);
    setBusyId(null);
    if (!result.ok) {
      haptic("error");
      setMessage(result.error);
      await reload({ silent: true });
      return;
    }
    haptic("success");
  }

  async function swipeDeleteTodo(todo: TodoRecord) {
    setData((current) => {
      if (!current) return current;
      if ("results" in current) {
        return { results: current.results.filter((item) => item.id !== todo.id) };
      }
      return { ...current, todos: removeTodo(current.todos, todo.id) };
    });
    const result = await cancelTodoAction(initData, todo.id);
    if (!result.ok) {
      haptic("error");
      setMessage(result.error);
      await reload({ silent: true });
      return;
    }
    haptic("success");
  }

  async function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = quickTitle.trim();
    if (!nextTitle) return;
    setBusy(true);
    const result = await addTodoAction(initData, {
      title: nextTitle,
      listSlug: view.kind === "list" ? view.slug : INBOX_SLUG,
      dueAt: view.kind === "today" ? defaultTodayDueAt() : null,
      remind: false,
    });
    setBusy(false);
    if (!result.ok) {
      haptic("error");
      setMessage(result.error);
      return;
    }
    haptic("success");
    setQuickTitle("");
    await reload({ silent: true });
  }

  function openComposer() {
    setTitle("");
    setListSlug(view.kind === "list" ? view.slug : INBOX_SLUG);
    setDueAt(view.kind === "today" ? defaultTodayDueAt() : "");
    setRemind(false);
    setComposerOpen(true);
  }

  function selectView(next: TasksView) {
    setQuery("");
    setSearchOpen(false);
    setView(next);
    setMenuOpen(false);
    setExpandedId(null);
  }

  return (
    <OwnerGuard>
      <div className="relative">
        <header className="mb-2 flex items-start justify-between gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-square btn-sm -ml-1 mt-1"
            aria-label="Open lists"
            onClick={() => setMenuOpen(true)}
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          {searchOpen ? (
            <input
              autoFocus
              className="input input-sm mt-1 flex-1"
              placeholder="Search to-dos"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : (
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="text-[1.75rem] font-semibold leading-none tracking-tight">
                {query.trim() ? "Search" : heading.title}
              </h1>
              {heading.subtitle && !query.trim() ? (
                <p className="mt-1 text-sm text-base-content/45">{heading.subtitle}</p>
              ) : null}
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-square btn-sm mt-1"
            aria-label={searchOpen ? "Close search" : "Search to-dos"}
            onClick={() => {
              setSearchOpen((open) => !open);
              if (searchOpen) setQuery("");
            }}
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
          </button>
        </header>

        {error ? <ErrorBanner message={error} /> : null}
        {message ? (
          <div className="alert alert-info mb-3 py-2 text-sm">{message}</div>
        ) : null}

        {loading && !data ? (
          <LoadingBlock />
        ) : view.kind === "reminders" && !query.trim() ? (
          <div>
            <ReminderComposer
              title={reminderTitle}
              date={reminderDate}
              time={reminderTime}
              recurrence={recurrence}
              busy={busy}
              onTitle={setReminderTitle}
              onDate={setReminderDate}
              onTime={setReminderTime}
              onRecurrence={setRecurrence}
              onSubmit={() =>
                void run(() =>
                  addReminderAction(initData, {
                    title: reminderTitle,
                    date: reminderDate,
                    time: reminderTime,
                    recurrence: recurrence === "none" ? null : recurrence,
                  }),
                ).then((ok) => {
                  if (ok) {
                    setReminderTitle("");
                    setReminderDate("");
                  }
                })
              }
            />
            {reminders.length === 0 ? (
              <p className="py-8 text-center text-sm text-base-content/45">
                No upcoming reminders.
              </p>
            ) : (
              <ul>
                {reminders.map((reminder) => (
                  <li
                    key={reminder.id}
                    className="flex items-center justify-between gap-3 border-b border-base-200 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm">{reminder.title}</span>
                      <span className="text-xs text-base-content/45">
                        {new Date(reminder.remind_at).toLocaleString()}
                        {reminder.recurrence ? ` · ${reminder.recurrence}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(() => cancelReminderAction(initData, reminder.id))
                      }
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            {!query.trim() ? (
              <form className="mb-2" onSubmit={(event) => void quickAdd(event)}>
                <input
                  className="input input-ghost h-11 w-full px-0 text-[0.95rem]"
                  placeholder="Add a to-do"
                  value={quickTitle}
                  disabled={busy}
                  onChange={(event) => setQuickTitle(event.target.value)}
                />
              </form>
            ) : null}

            {openItems.length === 0 && doneItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-base-content/45">
                {query.trim() ? "No matching to-dos." : "Nothing here. Nice."}
              </p>
            ) : (
              <ul className="divide-y divide-base-200">
                {openItems.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    lists={lists}
                    expanded={expandedId === todo.id}
                    busy={busyId === todo.id}
                    showList={view.kind !== "list"}
                    onToggle={() => void toggleTodo(todo)}
                    onExpand={() =>
                      setExpandedId((current) => (current === todo.id ? null : todo.id))
                    }
                    onMove={(slug) =>
                      void run(() => moveTodoAction(initData, todo.id, slug))
                    }
                    onDelete={() => setDeleteId(todo.id)}
                    onSwipeDelete={() => void swipeDeleteTodo(todo)}
                  />
                ))}
              </ul>
            )}

            {doneItems.length > 0 ? (
              <div className="mt-6">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/35">
                  Done
                </p>
                <ul className="divide-y divide-base-200">
                  {doneItems.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      lists={lists}
                      expanded={expandedId === todo.id}
                      busy={busyId === todo.id}
                      showList={view.kind !== "list"}
                      onToggle={() => void toggleTodo(todo)}
                      onExpand={() =>
                        setExpandedId((current) =>
                          current === todo.id ? null : todo.id,
                        )
                      }
                      onMove={(slug) =>
                        void run(() => moveTodoAction(initData, todo.id, slug))
                      }
                      onDelete={() => setDeleteId(todo.id)}
                      onSwipeDelete={() => void swipeDeleteTodo(todo)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {view.kind !== "reminders" ? (
          <button
            type="button"
            className="todo-fab btn btn-circle btn-info text-info-content shadow-lg"
            aria-label="Add to-do"
            onClick={openComposer}
          >
            <svg className="size-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2h5Z" />
            </svg>
          </button>
        ) : null}
      </div>

      <TodoSidebar
        open={menuOpen}
        view={view}
        lists={lists}
        reminderCount={reminders.length}
        newList={newList}
        busy={busy}
        onClose={() => setMenuOpen(false)}
        onSelect={selectView}
        onNewListChange={setNewList}
        onCreateList={() =>
          void run(() => createListAction(initData, newList)).then((ok) => {
            if (ok) setNewList("");
          })
        }
      />

      <TodoComposer
        open={composerOpen}
        busy={busy}
        title={title}
        listSlug={listSlug}
        dueAt={dueAt}
        remind={remind}
        lists={lists}
        onClose={() => setComposerOpen(false)}
        onTitle={setTitle}
        onListSlug={setListSlug}
        onDueAt={setDueAt}
        onRemind={setRemind}
        onSubmit={() =>
          void run(() =>
            addTodoAction(initData, {
              title,
              listSlug,
              dueAt: dueAt || null,
              remind: Boolean(dueAt) && remind,
            }),
          ).then((ok) => {
            if (ok) {
              setTitle("");
              setComposerOpen(false);
            }
          })
        }
      />

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete to-do?"
        body="This also cancels any linked reminder."
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id) void run(() => cancelTodoAction(initData, id));
        }}
      />
    </OwnerGuard>
  );
}
