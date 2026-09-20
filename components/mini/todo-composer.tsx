"use client";

import type { TodoListRecord } from "@/lib/todos";
import type { Recurrence } from "@/lib/reminder-time";

export function TodoComposer({
  open,
  busy,
  title,
  listSlug,
  dueAt,
  remind,
  lists,
  onClose,
  onTitle,
  onListSlug,
  onDueAt,
  onRemind,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  listSlug: string;
  dueAt: string;
  remind: boolean;
  lists: TodoListRecord[];
  onClose: () => void;
  onTitle: (value: string) => void;
  onListSlug: (value: string) => void;
  onDueAt: (value: string) => void;
  onRemind: (value: boolean) => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex justify-center">
      <div className="relative h-full w-full max-w-md">
        <button
          type="button"
          aria-label="Close add todo"
          className="pointer-events-auto absolute inset-0 bg-black/25"
          onClick={onClose}
        />
        <form
          className="pointer-events-auto absolute inset-x-0 bottom-0 rounded-t-3xl bg-base-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-base-300" />
          <input
            autoFocus
            className="input input-ghost h-12 w-full px-1 text-base"
            placeholder="New to-do"
            value={title}
            onChange={(event) => onTitle(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className="select select-sm bg-base-200"
              value={listSlug}
              onChange={(event) => onListSlug(event.target.value)}
            >
              {lists.map((list) => (
                <option key={list.slug} value={list.slug}>
                  {list.title}
                </option>
              ))}
            </select>
            <input
              className="input input-sm bg-base-200"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => onDueAt(event.target.value)}
            />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={remind}
              disabled={!dueAt}
              onChange={(event) => onRemind(event.target.checked)}
            />
            Remind me at due time
          </label>
          <button
            type="submit"
            className="btn btn-primary mt-4 w-full"
            disabled={busy || !title.trim()}
          >
            {busy ? "Adding…" : "Add to-do"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ReminderComposer({
  title,
  date,
  time,
  recurrence,
  busy,
  onTitle,
  onDate,
  onTime,
  onRecurrence,
  onSubmit,
}: {
  title: string;
  date: string;
  time: string;
  recurrence: Recurrence | "none";
  busy: boolean;
  onTitle: (value: string) => void;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onRecurrence: (value: Recurrence | "none") => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mb-4 rounded-2xl bg-base-200/70 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="input input-sm mb-2 w-full"
        placeholder="Reminder title"
        value={title}
        onChange={(event) => onTitle(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input input-sm"
          type="date"
          value={date}
          onChange={(event) => onDate(event.target.value)}
        />
        <input
          className="input input-sm"
          type="time"
          value={time}
          onChange={(event) => onTime(event.target.value)}
        />
      </div>
      <select
        className="select select-sm mt-2 w-full"
        value={recurrence}
        onChange={(event) => onRecurrence(event.target.value as Recurrence | "none")}
      >
        <option value="none">Once</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="weekdays">Weekdays</option>
      </select>
      <button
        type="submit"
        className="btn btn-primary btn-sm mt-3 w-full"
        disabled={busy || !title.trim() || !date}
      >
        Add reminder
      </button>
    </form>
  );
}
