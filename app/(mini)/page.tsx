"use client";

import Link from "next/link";
import { SnapshotCards } from "@/components/mini/snapshot-cards";
import { Money } from "@/components/mini/money";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniGet } from "@/components/mini/use-mini-get";
import type { getHomePayload } from "@/lib/mini-app/queries";

type HomePayload = Awaited<ReturnType<typeof getHomePayload>>;

export default function HomePage() {
  const { data, error, loading } = useMiniGet<HomePayload>("/api/mini/home");

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
    <>
      <PageHeader title="Admin" subtitle="Everyone who still owes" />
      {error ? <ErrorBanner message={error} /> : null}

      <div className="stats shadow w-full bg-base-200 mb-4">
        <div className="stat">
          <div className="stat-title">Combined net</div>
          <div className="stat-value text-2xl">
            <Money amount={data.allowe.grandTotal} />
          </div>
          <div className="stat-desc">{data.allowe.rows.length} people</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card bg-base-200">
          <div className="card-body py-4">
            <p className="text-xs opacity-70">Fitness today</p>
            <p className="font-semibold">
              {data.fitness
                ? `${data.fitness.weight_kg.toFixed(1)} kg · ${data.fitness.gym_status}`
                : "Not logged"}
            </p>
          </div>
        </div>
        <div className="card bg-base-200">
          <div className="card-body py-4">
            <p className="text-xs opacity-70">Todos today</p>
            <p className="font-semibold">
              {data.todosOpen} open · {data.todosDoneToday} done
            </p>
          </div>
        </div>
      </div>

      <ul className="list bg-base-100 rounded-box border border-base-300 mb-4">
        {data.allowe.rows.length === 0 ? (
          <li className="list-row">Everyone is settled. Nice.</li>
        ) : (
          data.allowe.rows.map((row) => (
            <li key={row.shortcode} className="list-row">
              <Link href={`/people/${row.shortcode}`} className="flex flex-1 justify-between gap-3">
                <span>
                  <span className="font-semibold">{row.shortcode}</span>
                  <span className="block text-xs opacity-70">{row.name}</span>
                </span>
                <Money amount={row.netTotal} className="font-semibold text-error" />
              </Link>
            </li>
          ))
        )}
      </ul>

      {data.remindersDueSoon.length > 0 ? (
        <div className="card bg-base-200">
          <div className="card-body py-4">
            <h2 className="card-title text-base">Upcoming reminders</h2>
            <ul className="text-sm">
              {data.remindersDueSoon.map((reminder) => (
                <li key={reminder.id} className="flex justify-between gap-2">
                  <span>{reminder.title}</span>
                  <span className="opacity-60">
                    {new Date(reminder.remind_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
