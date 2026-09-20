"use client";

import { useState } from "react";
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
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import type { getTasksPayload } from "@/lib/mini-app/queries";
import type { Recurrence } from "@/lib/reminder-time";
import type { TodoRecord } from "@/lib/todos";

type TasksPayload = Awaited<ReturnType<typeof getTasksPayload>>;
type SearchPayload = { results: TodoRecord[] };

export default function TasksPage() {
  const { initData, haptic } = useMiniApp();
  const [filter, setFilter] = useState("today");
  const [query, setQuery] = useState("");
  const path = query.trim()
    ? `/api/mini/owner/tasks?q=${encodeURIComponent(query.trim())}`
    : `/api/mini/owner/tasks?filter=${encodeURIComponent(filter)}`;
  const { data, error, loading, reload } = useMiniGet<TasksPayload | SearchPayload>(
    path,
  );
  const [title, setTitle] = useState("");
  const [listSlug, setListSlug] = useState("inbox");
  const [dueAt, setDueAt] = useState("");
  const [remind, setRemind] = useState(true);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("09:00");
  const [recurrence, setRecurrence] = useState<Recurrence | "none">("none");
  const [newList, setNewList] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function run(
    action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    success = "Saved",
  ) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      haptic("error");
      setMessage(result.error);
      return;
    }
    haptic("success");
    setMessage(success);
    await reload();
  }

  const lists = data && "lists" in data ? data.lists : [];
  const todos = data && "todos" in data ? data.todos : null;
  const reminders = data && "reminders" in data ? data.reminders : [];
  const searchResults = data && "results" in data ? data.results : null;

  return (
    <OwnerGuard>
      <PageHeader title="Tasks" subtitle="Todos and reminders" />
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <div className="alert alert-info mb-3 text-sm">{message}</div> : null}

      <div className="join w-full mb-3">
        {["today", "open", "all"].map((value) => (
          <button
            key={value}
            type="button"
            className={`join-item btn btn-sm flex-1 ${filter === value && !query ? "btn-primary" : ""}`}
            onClick={() => {
              setQuery("");
              setFilter(value);
            }}
          >
            {value}
          </button>
        ))}
      </div>

      <input
        className="input input-sm w-full mb-4"
        placeholder="Search todos"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {loading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4 gap-2">
              <h2 className="card-title text-base">Add todo</h2>
              <input
                className="input input-sm"
                placeholder="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <select
                className="select select-sm"
                value={listSlug}
                onChange={(event) => setListSlug(event.target.value)}
              >
                {lists.map((list) => (
                  <option key={list.slug} value={list.slug}>
                    {list.title}
                  </option>
                ))}
              </select>
              <input
                className="input input-sm"
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={remind}
                  onChange={(event) => setRemind(event.target.checked)}
                />
                <span className="label-text">Remind me at due time</span>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    addTodoAction(initData, {
                      title,
                      listSlug,
                      dueAt: dueAt || null,
                      remind,
                    }),
                  )
                }
              >
                Add todo
              </button>
            </div>
          </section>

          <ul className="flex flex-col gap-2">
            {(searchResults ?? [
              ...(todos?.open ?? []),
              ...(todos?.doneToday ?? []),
              ...(todos?.done ?? []),
            ]).map((todo) => (
              <li key={todo.id} className="rounded-box bg-base-200 p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className={todo.done ? "line-through opacity-60" : ""}>
                    {todo.title}
                    <span className="block text-xs opacity-60">
                      #{todo.list_slug}
                      {todo.due_at
                        ? ` · ${new Date(todo.due_at).toLocaleString()}`
                        : ""}
                    </span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-xs"
                    disabled={busy}
                    onClick={() =>
                      run(() => setTodoDoneAction(initData, todo.id, !todo.done))
                    }
                  >
                    {todo.done ? "Undo" : "Done"}
                  </button>
                  <select
                    className="select select-xs"
                    value={todo.list_slug}
                    onChange={(event) =>
                      void run(() =>
                        moveTodoAction(initData, todo.id, event.target.value),
                      )
                    }
                  >
                    {lists.map((list) => (
                      <option key={list.slug} value={list.slug}>
                        {list.slug}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost text-error"
                    onClick={() => setDeleteId(todo.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4 gap-2">
              <h2 className="card-title text-base">Add reminder</h2>
              <input
                className="input input-sm"
                placeholder="Title"
                value={reminderTitle}
                onChange={(event) => setReminderTitle(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input input-sm"
                  type="date"
                  value={reminderDate}
                  onChange={(event) => setReminderDate(event.target.value)}
                />
                <input
                  className="input input-sm"
                  type="time"
                  value={reminderTime}
                  onChange={(event) => setReminderTime(event.target.value)}
                />
              </div>
              <select
                className="select select-sm"
                value={recurrence}
                onChange={(event) =>
                  setRecurrence(event.target.value as Recurrence | "none")
                }
              >
                <option value="none">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="weekdays">Weekdays</option>
              </select>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    addReminderAction(initData, {
                      title: reminderTitle,
                      date: reminderDate,
                      time: reminderTime,
                      recurrence: recurrence === "none" ? null : recurrence,
                    }),
                  )
                }
              >
                Add reminder
              </button>
            </div>
          </section>

          <ul className="text-sm">
            {reminders.map((reminder) => (
              <li key={reminder.id} className="flex justify-between gap-2 py-1">
                <span>
                  {reminder.title}
                  <span className="block text-xs opacity-60">
                    {new Date(reminder.remind_at).toLocaleString()}
                    {reminder.recurrence ? ` · ${reminder.recurrence}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() =>
                    void run(() => cancelReminderAction(initData, reminder.id))
                  }
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>

          <div className="join">
            <input
              className="input input-sm join-item"
              placeholder="New list slug"
              value={newList}
              onChange={(event) => setNewList(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm join-item"
              onClick={() => run(() => createListAction(initData, newList))}
            >
              Add list
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete todo?"
        body="This also cancels any linked reminder."
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id) void run(() => cancelTodoAction(initData, id), "Deleted");
        }}
      />
    </OwnerGuard>
  );
}
