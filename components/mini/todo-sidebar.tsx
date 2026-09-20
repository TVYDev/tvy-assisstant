"use client";

import type { ReactNode } from "react";
import type { TodoListRecord } from "@/lib/todos";
import { INBOX_SLUG, listDotColor } from "@/lib/mini-app/todo-display";
import type { TasksView } from "./todo-types";

export function TodoSidebar({
  open,
  view,
  lists,
  reminderCount,
  newList,
  busy,
  onClose,
  onSelect,
  onNewListChange,
  onCreateList,
}: {
  open: boolean;
  view: TasksView;
  lists: Array<TodoListRecord & { open_count: number }>;
  reminderCount: number;
  newList: string;
  busy: boolean;
  onClose: () => void;
  onSelect: (view: TasksView) => void;
  onNewListChange: (value: string) => void;
  onCreateList: () => void;
}) {
  if (!open) return null;

  const inbox = lists.find((list) => list.slug === INBOX_SLUG);
  const projects = lists.filter((list) => list.slug !== INBOX_SLUG);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex justify-center">
      <div className="relative h-full w-full max-w-md">
        <button
          type="button"
          aria-label="Close lists"
          className="pointer-events-auto absolute inset-0 bg-black/20"
          onClick={onClose}
        />
        <aside className="pointer-events-auto absolute inset-y-0 left-0 flex w-[min(17.5rem,84%)] flex-col bg-base-100 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-xl">
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <p className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-base-content/40">
              Lists
            </p>
            <nav className="flex flex-col">
              <SideRow
                active={view.kind === "today"}
                label="Today"
                icon={<StarIcon />}
                onClick={() => onSelect({ kind: "today" })}
              />
              <SideRow
                active={view.kind === "anytime"}
                label="Anytime"
                icon={<StackIcon />}
                onClick={() => onSelect({ kind: "anytime" })}
              />
              <SideRow
                active={view.kind === "list" && view.slug === INBOX_SLUG}
                label="Inbox"
                count={inbox?.open_count}
                icon={<InboxIcon />}
                onClick={() => onSelect({ kind: "list", slug: INBOX_SLUG })}
              />
              <SideRow
                active={view.kind === "reminders"}
                label="Reminders"
                count={reminderCount}
                icon={<BellIcon />}
                onClick={() => onSelect({ kind: "reminders" })}
              />
            </nav>

            <p className="mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wide text-base-content/40">
              Projects
            </p>
            <nav className="flex flex-col">
              {projects.map((list) => (
                <SideRow
                  key={list.slug}
                  active={view.kind === "list" && view.slug === list.slug}
                  label={list.title}
                  count={list.open_count}
                  icon={<Dot color={listDotColor(list.slug)} />}
                  onClick={() => onSelect({ kind: "list", slug: list.slug })}
                />
              ))}
            </nav>
          </div>

          <form
            className="flex gap-2 border-t border-base-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(event) => {
              event.preventDefault();
              onCreateList();
            }}
          >
            <input
              className="input input-sm min-w-0 flex-1"
              placeholder="New list"
              value={newList}
              onChange={(event) => onNewListChange(event.target.value)}
            />
            <button type="submit" className="btn btn-sm" disabled={busy || !newList.trim()}>
              Add
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function SideRow({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm ${
        active ? "bg-base-200 font-medium" : "hover:bg-base-200/70"
      }`}
      onClick={onClick}
    >
      <span className="flex size-6 items-center justify-center text-base-content/70">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? (
        <span className="text-xs tabular-nums text-base-content/40">{count}</span>
      ) : null}
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="size-2.5 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function StarIcon() {
  return (
    <svg className="size-4 text-warning" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3.4 14.6 9l6 .5-4.6 4 1.4 5.8L12 16.6 6.6 19.3 8 13.5 3.4 9.5l6-.5L12 3.4Z" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8h16M6 12h12M8 16h8" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 13h4l2 3h4l2-3h4v6H4v-6Z" />
      <path d="M4 13 7 5h10l3 8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 17h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v4.8L6 17Z" />
      <path d="M10 17a2 2 0 0 0 4 0" />
    </svg>
  );
}
