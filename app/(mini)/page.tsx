"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type Dispatch, type SetStateAction } from "react";
import { cancelTodoAction, setTodoDoneAction } from "@/app/actions/mini";
import { SnapshotCards } from "@/components/mini/snapshot-cards";
import { Money } from "@/components/mini/money";
import { TodoItem } from "@/components/mini/todo-item";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import {
  applyTodoDone,
  formatHeadingDate,
  formatReminderGlance,
  removeTodo,
} from "@/lib/mini-app/todo-display";
import type { getHomePayload } from "@/lib/mini-app/queries";
import type { TodoRecord } from "@/lib/todos";

type HomePayload = Awaited<ReturnType<typeof getHomePayload>>;

const HOME_OPEN_CAP = 8;

export default function HomePage() {
  const { data, error, loading, reload, setData } = useMiniGet<HomePayload>(
    "/api/mini/home",
  );

  if (loading || !data) {
    return (
      <>
        <PageHeader title="Dino" subtitle="Your tab with Vannyou" />
        {error ? <ErrorBanner message={error} /> : <LoadingBlock />}
      </>
    );
  }

  if (data.kind === "user") {
    return (
      <>
        <PageHeader
          title={`Hey ${data.snapshot.name || "there"}`}
          subtitle="Here's your current tab"
        />
        {error ? <ErrorBanner message={error} /> : null}
        <SnapshotCards snapshot={data.snapshot} />
        {data.snapshot.netOwed > 0 ? (
          <Link href="/pay" className="btn btn-primary mt-4 w-full">
            Pay with KHQR
          </Link>
        ) : null}
      </>
    );
  }

  return (
    <OwnerHome
      data={data}
      error={error}
      setData={setData}
      reload={reload}
    />
  );
}

function OwnerHome({
  data,
  error,
  setData,
  reload,
}: {
  data: Extract<HomePayload, { kind: "owner" }>;
  error: string | null;
  setData: Dispatch<SetStateAction<HomePayload | null>>;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
}) {
  const router = useRouter();
  const { initData, haptic } = useMiniApp();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggleTodo(todo: TodoRecord) {
    const nextDone = !todo.done;
    setBusyId(todo.id);
    setData((current) => {
      if (!current || current.kind !== "owner") return current;
      return {
        ...current,
        todayTodos: applyTodoDone(current.todayTodos, todo.id, nextDone),
      };
    });
    const result = await setTodoDoneAction(initData, todo.id, nextDone);
    setBusyId(null);
    if (!result.ok) {
      haptic("error");
      await reload({ silent: true });
      return;
    }
    haptic("success");
  }

  async function deleteTodo(todo: TodoRecord) {
    setData((current) => {
      if (!current || current.kind !== "owner") return current;
      return {
        ...current,
        todayTodos: removeTodo(current.todayTodos, todo.id),
      };
    });
    const result = await cancelTodoAction(initData, todo.id);
    if (!result.ok) {
      haptic("error");
      await reload({ silent: true });
      return;
    }
    haptic("success");
  }

  const { open, doneToday } = data.todayTodos;
  const visibleOpen = open.slice(0, HOME_OPEN_CAP);
  const hiddenOpen = open.length - visibleOpen.length;

  return (
    <>
      {error ? <ErrorBanner message={error} /> : null}

      {data.wordOfTheDay ? (
        <section className="mb-5 rounded-2xl bg-base-200 px-4 py-3">
          <p className="text-xs text-base-content/50">Word of the day · 08:19</p>
          <p className="text-xl font-semibold">{data.wordOfTheDay.word}</p>
          {data.wordOfTheDay.pronounciationRegion || data.wordOfTheDay.pronounciation ? (
            <p className="text-sm text-base-content/60">
              {[data.wordOfTheDay.pronounciationRegion, data.wordOfTheDay.pronounciation]
                .filter(Boolean)
                .join(" ")}
            </p>
          ) : null}
          <p className="mt-1 text-sm">{data.wordOfTheDay.definition}</p>
        </section>
      ) : null}

      <section className="mb-5">
        <Link href="/tasks" className="mb-1 flex items-end justify-between gap-3">
          <h1 className="text-[1.75rem] font-semibold leading-none tracking-tight">
            Today
          </h1>
          <span className="text-sm text-base-content/45">{formatHeadingDate()}</span>
        </Link>

        {open.length === 0 ? (
          <Link href="/tasks" className="block py-5 text-sm text-base-content/45">
            {doneToday.length > 0
              ? `${doneToday.length} done today. Add the next one →`
              : "Nothing due. Add a to-do →"}
          </Link>
        ) : (
          <ul>
            {visibleOpen.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                lists={[]}
                expanded={false}
                busy={busyId === todo.id}
                onToggle={() => void toggleTodo(todo)}
                onExpand={() => router.push("/tasks")}
                onSwipeDelete={() => void deleteTodo(todo)}
              />
            ))}
          </ul>
        )}

        {hiddenOpen > 0 || doneToday.length > 0 ? (
          <Link href="/tasks" className="mt-2 inline-block text-sm text-info">
            {hiddenOpen > 0 ? `${hiddenOpen} more` : null}
            {hiddenOpen > 0 && doneToday.length > 0 ? " · " : null}
            {doneToday.length > 0 ? `${doneToday.length} done` : null}
          </Link>
        ) : null}
      </section>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <Link href="/people" className="rounded-2xl bg-base-200 px-3 py-3">
          <p className="text-xs text-base-content/50">Owed</p>
          <p className="font-semibold">
            <Money amount={data.allowe.grandTotal} />
          </p>
          <p className="text-xs text-base-content/45">
            {data.allowe.rows.length} people
          </p>
        </Link>
        <Link href="/fitness" className="rounded-2xl bg-base-200 px-3 py-3">
          <p className="text-xs text-base-content/50">Fitness</p>
          <p className="font-semibold">
            {data.fitness ? `${data.fitness.weight_kg.toFixed(1)} kg` : "Log it"}
          </p>
          <p className="text-xs text-base-content/45">
            {data.fitness ? data.fitness.gym_status : "not today"}
          </p>
        </Link>
      </div>

      {data.allowe.rows.length > 0 ? (
        <ul className="mb-4">
          {data.allowe.rows.map((row) => (
            <li key={row.shortcode}>
              <Link
                href={`/people/${row.shortcode}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span className="font-medium">{row.shortcode}</span>
                  <span className="ml-2 text-sm text-base-content/45">{row.name}</span>
                </span>
                <Money amount={row.netTotal} className="font-semibold text-error" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {data.remindersDueSoon.length > 0 ? (
        <Link href="/tasks" className="block">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/35">
            Next
          </p>
          <ul>
            {data.remindersDueSoon.map((reminder) => (
              <li key={reminder.id} className="flex justify-between gap-3 py-1.5 text-sm">
                <span className="truncate">{reminder.title}</span>
                <span className="shrink-0 text-base-content/45">
                  {formatReminderGlance(reminder.remind_at)}
                </span>
              </li>
            ))}
          </ul>
        </Link>
      ) : null}
    </>
  );
}
