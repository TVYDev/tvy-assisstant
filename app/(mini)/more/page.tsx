"use client";

import { useState } from "react";
import {
  addFeeAction,
  runCronAction,
  updateStickerAction,
  updateUserAction,
} from "@/app/actions/mini";
import { ConfirmDialog } from "@/components/mini/confirm-dialog";
import { OwnerGuard } from "@/components/mini/owner-guard";
import { SnapshotCards } from "@/components/mini/snapshot-cards";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import { miniGet } from "@/components/mini/api";
import type { getMorePayload } from "@/lib/mini-app/queries";
import type { OweSnapshot } from "@/lib/owe-message";

const STICKER_COMMANDS = ["start", "owe", "qr", "about"] as const;

type MorePayload = Awaited<ReturnType<typeof getMorePayload>>;

export default function MorePage() {
  const { initData, haptic } = useMiniApp();
  const { data, error, loading, reload } = useMiniGet<MorePayload>(
    "/api/mini/owner/more",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fee, setFee] = useState("");
  const [feeFrom, setFeeFrom] = useState("");
  const [feeTo, setFeeTo] = useState("");
  const [previewCode, setPreviewCode] = useState("");
  const [preview, setPreview] = useState<OweSnapshot | null>(null);
  const [cronJob, setCronJob] = useState<"youtube" | "fitness" | "gym" | "reminders" | null>(
    null,
  );

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
    setMessage(typeof result.data === "string" ? result.data : success);
    await reload();
  }

  return (
    <OwnerGuard>
      <PageHeader title="More" subtitle="Users, fees, stickers, crons" />
      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <div className="alert alert-info mb-3 whitespace-pre-wrap text-sm">{message}</div>
      ) : null}
      {loading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">Preview /owe</h2>
              <div className="join w-full">
                <select
                  className="select select-sm join-item"
                  value={previewCode}
                  onChange={(event) => setPreviewCode(event.target.value)}
                >
                  <option value="">Pick shortcode</option>
                  {data.shortcodes.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm join-item"
                  onClick={async () => {
                    if (!previewCode) return;
                    const result = await miniGet<{ snapshot: OweSnapshot }>(
                      `/api/mini/owner/more?preview=${previewCode}`,
                      initData,
                    );
                    setPreview(result.snapshot);
                  }}
                >
                  Preview
                </button>
              </div>
              {preview ? <div className="mt-3"><SnapshotCards snapshot={preview} /></div> : null}
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">
                YouTube fees · ${data.currentFee.toFixed(2)}/mo
              </h2>
              <ul className="text-sm mb-2">
                {data.fees.map((schedule) => (
                  <li key={schedule.id}>
                    #{schedule.id} ${schedule.fee.toFixed(2)} from {schedule.effective_from}{" "}
                    to {schedule.effective_to ?? "ongoing"}
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input input-sm"
                  placeholder="Fee"
                  type="number"
                  step="0.01"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                />
                <input
                  className="input input-sm"
                  type="date"
                  value={feeFrom}
                  onChange={(event) => setFeeFrom(event.target.value)}
                />
                <input
                  className="input input-sm col-span-2"
                  type="date"
                  value={feeTo}
                  onChange={(event) => setFeeTo(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    addFeeAction(initData, {
                      fee: Number(fee),
                      effectiveFrom: feeFrom,
                      effectiveTo: feeTo || null,
                    }),
                  )
                }
              >
                Add fee period
              </button>
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">Follow-up stickers</h2>
              <p className="text-xs opacity-70">
                Paste a sticker file_id here. Sending a sticker in DM still assigns from the bot.
              </p>
              {STICKER_COMMANDS.map((command) => {
                const rule = data.stickers[command];
                return (
                  <div key={command} className="rounded-box bg-base-200 p-3 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{command}</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-sm"
                        checked={rule.enabled}
                        onChange={() =>
                          void run(() =>
                            updateStickerAction(initData, {
                              command,
                              patch: { enabled: !rule.enabled },
                            }),
                          )
                        }
                      />
                    </div>
                    <input
                      className="input input-xs w-full mt-2"
                      placeholder="sticker file_id"
                      defaultValue={rule.stickerId ?? ""}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        void run(() =>
                          updateStickerAction(initData, {
                            command,
                            patch: { stickerId: value || null },
                          }),
                        );
                      }}
                    />
                    <label className="label text-xs mt-1">
                      Min net owed
                      <input
                        className="input input-xs w-24"
                        type="number"
                        defaultValue={rule.minNetOwed ?? ""}
                        onBlur={(event) => {
                          const raw = event.target.value.trim();
                          void run(() =>
                            updateStickerAction(initData, {
                              command,
                              patch: {
                                minNetOwed: raw === "" ? null : Number(raw),
                              },
                            }),
                          );
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">Run crons</h2>
              <p className="text-xs opacity-70">
                These post for real, same as the bot menu. Fitness and gym bypass skip checks.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["youtube", "YouTube reminder"],
                    ["fitness", "Fitness reminder"],
                    ["gym", "Gym motivation"],
                    ["reminders", "Due reminders"],
                  ] as const
                ).map(([job, label]) => (
                  <button
                    key={job}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setCronJob(job)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">Users</h2>
              <ul className="text-sm">
                {data.users.map((user) => (
                  <li key={`${user.shortcode}-${user.telegram_user_id}`} className="py-1">
                    <span className="font-semibold">{user.shortcode ?? "—"}</span>{" "}
                    {user.first_name} {user.last_name}
                    {user.telegram_username ? ` @${user.telegram_username}` : ""}
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost ml-2"
                      onClick={() => {
                        const value = window.prompt(
                          "New shortcode (or cancel)",
                          user.shortcode ?? "",
                        );
                        if (!value || !user.shortcode) return;
                        void run(() =>
                          updateUserAction(initData, {
                            shortcode: user.shortcode!,
                            field: "shortcode",
                            value,
                          }),
                        );
                      }}
                    >
                      Rename
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={cronJob !== null}
        title="Run this cron?"
        body="This uses the same jobs as Vercel cron and can send Telegram messages."
        confirmLabel="Run now"
        busy={busy}
        onCancel={() => setCronJob(null)}
        onConfirm={() => {
          const job = cronJob;
          setCronJob(null);
          if (job) void run(() => runCronAction(initData, job));
        }}
      />
    </OwnerGuard>
  );
}
