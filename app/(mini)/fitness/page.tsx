"use client";

import { useState } from "react";
import { logFitnessAction, setGymReminderAction } from "@/app/actions/mini";
import { OwnerGuard } from "@/components/mini/owner-guard";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import type { GymStatus } from "@/lib/fitness-log";
import type { getFitnessPayload } from "@/lib/mini-app/queries";

type FitnessPayload = Awaited<ReturnType<typeof getFitnessPayload>>;

const GYM_SESSIONS = [
  "chest",
  "shoulder",
  "back",
  "triceps",
  "biceps",
  "legs",
  "cardio",
] as const;

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cellClass(status: string | undefined, future: boolean) {
  if (future) return "bg-base-200";
  if (status === "gym") return "bg-success";
  if (status === "rest") return "bg-base-300";
  if (status === "skip") return "bg-warning";
  return "bg-neutral";
}

export default function FitnessPage() {
  const { initData, haptic } = useMiniApp();
  const { data, error, loading, reload } = useMiniGet<FitnessPayload>(
    "/api/mini/owner/fitness",
  );
  const [logDate, setLogDate] = useState("");
  const [weight, setWeight] = useState("");
  const [status, setStatus] = useState<GymStatus>("rest");
  const [session, setSession] = useState<(typeof GYM_SESSIONS)[number]>("chest");
  const [minutes, setMinutes] = useState("45");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = data?.today ?? "";
  const dateValue = logDate || today;

  const activityMap = new Map<string, GymStatus>();
  if (data) {
    for (const log of data.history) {
      activityMap.set(addDays(log.log_date, -1), log.gym_status);
    }
  }
  const weeks = data?.weeks ?? 12;
  const gridStart = data
    ? (() => {
        const today = data.today;
        const [y, m, d] = today.split("-").map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        const sundayZero = date.getUTCDay();
        const mondayZero = sundayZero === 0 ? 6 : sundayZero - 1;
        return addDays(today, -mondayZero - (weeks - 1) * 7);
      })()
    : null;
  const activityEnd = data ? addDays(data.today, -1) : null;

  return (
    <OwnerGuard>
      <PageHeader title="Fitness" subtitle="Log weight and yesterday's gym" />
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <div className="alert alert-info mb-3 text-sm">{message}</div> : null}
      {loading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="form-control gap-2">
            <input
              className="input input-sm"
              type="date"
              value={dateValue}
              onChange={(event) => setLogDate(event.target.value)}
            />
            <input
              className="input input-sm"
              type="number"
              step="0.1"
              placeholder="Weight kg"
              value={weight || (data.log ? String(data.log.weight_kg) : "")}
              onChange={(event) => setWeight(event.target.value)}
            />
            <div className="join w-full">
              {(["gym", "rest", "skip"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`join-item btn btn-sm flex-1 ${status === value ? "btn-primary" : ""}`}
                  onClick={() => setStatus(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            {status === "gym" ? (
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="select select-sm"
                  value={session}
                  onChange={(event) =>
                    setSession(event.target.value as (typeof GYM_SESSIONS)[number])
                  }
                >
                  {GYM_SESSIONS.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <input
                  className="input input-sm"
                  type="number"
                  min="1"
                  max="600"
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                />
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await logFitnessAction(initData, {
                  logDate: dateValue,
                  weightKg: Number(weight || data.log?.weight_kg),
                  gymStatus: status,
                  gymSession: session,
                  gymMinutes: Number(minutes),
                });
                setBusy(false);
                if (!result.ok) {
                  haptic("error");
                  setMessage(result.error);
                  return;
                }
                haptic("success");
                setMessage("Logged");
                await reload();
              }}
            >
              Save log
            </button>
          </div>

          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={data.gymReminderEnabled}
              onChange={async (event) => {
                const result = await setGymReminderAction(
                  initData,
                  event.target.checked,
                );
                if (!result.ok) setMessage(result.error);
                else await reload();
              }}
            />
            <span className="label-text">Weekday gym motivation DM</span>
          </label>

          {gridStart && activityEnd ? (
            <div className="overflow-x-auto">
              <p className="text-sm font-semibold mb-2">Activity grid</p>
              <div className="flex gap-1">
                {Array.from({ length: weeks }).map((_, week) => {
                  const weekStart = addDays(gridStart, week * 7);
                  return (
                    <div key={weekStart} className="flex flex-col gap-1">
                      {Array.from({ length: 7 }).map((__, dow) => {
                        const date = addDays(weekStart, dow);
                        const future = date > activityEnd;
                        return (
                          <div
                            key={date}
                            title={date}
                            className={`size-3 rounded-sm ${cellClass(activityMap.get(date), future)}`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <ul className="text-sm">
            {data.history.slice(0, 10).map((log) => (
              <li key={log.id} className="flex justify-between py-1">
                <span>{log.log_date}</span>
                <span>
                  {log.weight_kg.toFixed(1)} kg · {log.gym_status}
                  {log.gym_session ? ` ${log.gym_session}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OwnerGuard>
  );
}
