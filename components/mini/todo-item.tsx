"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { TodoListRecord, TodoRecord } from "@/lib/todos";
import {
  formatTodoDueMeta,
  listDotColor,
  resolveTodoSwipe,
  TODO_SWIPE_THRESHOLD,
} from "@/lib/mini-app/todo-display";

const LOCK = 8;
const MAX = 128;

export function TodoItem({
  todo,
  lists,
  expanded,
  busy,
  showList = true,
  onToggle,
  onExpand,
  onMove,
  onDelete,
  onSwipeDelete,
}: {
  todo: TodoRecord;
  lists: TodoListRecord[];
  expanded: boolean;
  busy: boolean;
  showList?: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onMove?: (listSlug: string) => void;
  onDelete?: () => void;
  onSwipeDelete?: () => void;
}) {
  const color = listDotColor(todo.list_slug);
  const due = formatTodoDueMeta(todo.due_at);
  const canDelete = Boolean(onSwipeDelete ?? onDelete);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    axis: null as "x" | "y" | null,
    offset: 0,
    ignoreClick: false,
  });

  function finish(next: number, axis: "x" | "y" | null) {
    const action = axis === "x" ? resolveTodoSwipe(next, canDelete) : null;
    if (action === "toggle") {
      gesture.current.ignoreClick = true;
      setOffset(0);
      onToggle();
      return;
    }
    if (action === "delete") {
      gesture.current.ignoreClick = true;
      setOffset(0);
      (onSwipeDelete ?? onDelete)?.();
      return;
    }
    setOffset(0);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (busy || event.button !== 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      offset: 0,
      ignoreClick: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some WebViews reject capture on untrusted or nested pointers.
    }
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.axis) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (current.axis === "y") {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
        return;
      }
    }
    if (current.axis !== "x") return;
    event.preventDefault();
    let next = dx;
    if (next > 0) next = Math.min(next, MAX);
    else next = canDelete ? Math.max(next, -MAX) : 0;
    current.offset = next;
    setOffset(next);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current.pointerId !== event.pointerId) return;
    current.pointerId = -1;
    setDragging(false);
    finish(current.offset, current.axis);
  }

  function handleActivate() {
    if (gesture.current.ignoreClick) {
      gesture.current.ignoreClick = false;
      return;
    }
    onExpand();
  }

  return (
    <li className="todo-row">
      <div className="todo-swipe">
        <div
          className="todo-swipe-action todo-swipe-action-done"
          aria-hidden={offset <= 8}
          style={{
            width: Math.max(offset, 0),
            visibility: offset > 8 ? "visible" : "hidden",
          }}
        >
          {todo.done ? "Undo" : "Done"}
        </div>
        {canDelete ? (
          <div
            className="todo-swipe-action todo-swipe-action-delete"
            aria-hidden={offset >= -8}
            style={{
              width: Math.max(-offset, 0),
              visibility: offset < -8 ? "visible" : "hidden",
            }}
          >
            Delete
          </div>
        ) : null}

        <div
          className={`todo-swipe-layer ${dragging ? "todo-swipe-layer-dragging" : ""}`}
          style={{ transform: `translate3d(${offset}px, 0, 0)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="flex items-start gap-3 py-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={todo.done}
              aria-label={
                todo.done
                  ? `Mark ${todo.title} as not done`
                  : `Mark ${todo.title} done`
              }
              disabled={busy}
              className="todo-check mt-0.5 shrink-0"
              style={
                todo.done
                  ? { background: color, borderColor: color }
                  : { borderColor: color }
              }
              onClick={(event) => {
                event.stopPropagation();
                if (gesture.current.ignoreClick) {
                  gesture.current.ignoreClick = false;
                  return;
                }
                onToggle();
              }}
            >
              {todo.done ? (
                <svg viewBox="0 0 16 16" className="size-3 text-white" aria-hidden>
                  <path
                    d="M3.5 8.2 6.4 11.2 12.5 4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>

            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={handleActivate}
            >
              <p
                className={`text-[0.95rem] leading-snug ${
                  todo.done
                    ? "text-base-content/40 line-through"
                    : "text-base-content"
                }`}
              >
                {todo.title}
              </p>
              {due || showList ? (
                <p className="mt-0.5 text-xs leading-relaxed">
                  {due ? (
                    <span
                      className={
                        due.overdue ? "text-error" : "text-base-content/45"
                      }
                    >
                      {due.label}
                    </span>
                  ) : null}
                  {due && showList ? (
                    <span className="text-base-content/30"> · </span>
                  ) : null}
                  {showList ? (
                    <span className="text-base-content/45">#{todo.list_slug}</span>
                  ) : null}
                </p>
              ) : null}
            </button>
          </div>
        </div>
      </div>

      {expanded && (onMove || onDelete) ? (
        <div className="mb-3 ml-8 flex flex-wrap items-center gap-2">
          {onMove ? (
            <select
              className="select select-xs bg-base-200"
              value={todo.list_slug}
              disabled={busy}
              aria-label="Move to list"
              onChange={(event) => onMove(event.target.value)}
            >
              {lists.map((list) => (
                <option key={list.slug} value={list.slug}>
                  {list.title}
                </option>
              ))}
            </select>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="btn btn-xs btn-ghost text-error"
              disabled={busy}
              onClick={onDelete}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
