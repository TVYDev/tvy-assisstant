"use client";

import { use, useState } from "react";
import {
  addDebtAction,
  addDepositAction,
  cancelDebtAction,
  payAllAction,
  reduceDepositAction,
  toggleAllYoutubeAction,
  toggleDebtPaidAction,
  toggleYoutubeMonthAction,
  updateDebtAction,
  updateUserAction,
} from "@/app/actions/mini";
import { ConfirmDialog } from "@/components/mini/confirm-dialog";
import { Money } from "@/components/mini/money";
import { OwnerGuard } from "@/components/mini/owner-guard";
import { SettleFields } from "@/components/mini/settle-fields";
import { SnapshotCards } from "@/components/mini/snapshot-cards";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";
import { useMiniGet } from "@/components/mini/use-mini-get";
import type { PersonLedger } from "@/lib/mini-app/queries";
import type { SettleInput } from "@/lib/mini-app/mutations";

const defaultSettle: SettleInput = { mode: "mark_only" };

export default function PersonPage({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  const { shortcode } = use(params);
  const code = shortcode.toUpperCase();
  const { initData, haptic } = useMiniApp();
  const { data, error, loading, reload } = useMiniGet<PersonLedger>(
    `/api/mini/owner/people/${code}`,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settle, setSettle] = useState<SettleInput>(defaultSettle);
  const [confirmPayAll, setConfirmPayAll] = useState(false);
  const [debtForm, setDebtForm] = useState({ amount: "", description: "" });
  const [depositForm, setDepositForm] = useState({ amount: "", note: "" });
  const [userFormOverride, setUserFormOverride] = useState<{
    first_name: string;
    last_name: string;
    telegram_username: string;
    telegram_user_id: string;
  } | null>(null);
  const userForm = userFormOverride ?? {
    first_name: data?.user?.first_name ?? "",
    last_name: data?.user?.last_name ?? "",
    telegram_username: data?.user?.telegram_username ?? "",
    telegram_user_id: data?.user?.telegram_user_id
      ? String(data.user.telegram_user_id)
      : "",
  };

  function patchUserForm(
    field: "first_name" | "last_name" | "telegram_username" | "telegram_user_id",
    value: string,
  ) {
    setUserFormOverride({ ...userForm, [field]: value });
  }


  async function run(
    action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    success = "Saved",
  ) {
    setBusy(true);
    setMessage(null);
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

  return (
    <OwnerGuard>
      <PageHeader title={code} subtitle={data?.user?.first_name ?? "Ledger"} />
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <div className="alert alert-info mb-3 text-sm">{message}</div> : null}
      {loading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-4">
          <SnapshotCards snapshot={data.snapshot} />

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">Add debt</h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input input-sm"
                  placeholder="Amount"
                  type="number"
                  step="0.01"
                  value={debtForm.amount}
                  onChange={(event) =>
                    setDebtForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
                <input
                  className="input input-sm col-span-2"
                  placeholder="Description"
                  value={debtForm.description}
                  onChange={(event) =>
                    setDebtForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    addDebtAction(initData, {
                      shortcode: code,
                      amount: Number(debtForm.amount),
                      description: debtForm.description,
                    }),
                  )
                }
              >
                Add item
              </button>
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">Debt items</h2>
              {data.items.length === 0 ? (
                <p className="text-sm opacity-70">No items.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.items.map((item) => (
                    <li key={item.id} className="rounded-box bg-base-200 p-3">
                      <div className="flex justify-between gap-2 text-sm">
                        <span>
                          #{item.id} {item.description}
                          <span className="block text-xs opacity-60">
                            {item.date}
                            {item.paid ? " · paid" : ""}
                          </span>
                        </span>
                        <Money amount={item.amount} className="font-semibold" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-xs"
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              toggleDebtPaidAction(initData, {
                                itemId: item.id,
                                paid: !item.paid,
                                settle: item.paid ? undefined : settle,
                              }),
                            )
                          }
                        >
                          {item.paid ? "Mark unpaid" : "Mark paid"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            const amount = window.prompt("New amount", String(item.amount));
                            const description = window.prompt(
                              "New description",
                              item.description,
                            );
                            if (!amount || !description) return;
                            void run(() =>
                              updateDebtAction(initData, {
                                itemId: item.id,
                                amount: Number(amount),
                                description,
                              }),
                            );
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost text-error"
                          disabled={busy}
                          onClick={() =>
                            run(() => cancelDebtAction(initData, item.id), "Removed")
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">
                Deposit <Money amount={data.deposit} />
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input input-sm"
                  placeholder="Amount"
                  type="number"
                  step="0.01"
                  value={depositForm.amount}
                  onChange={(event) =>
                    setDepositForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
                <input
                  className="input input-sm"
                  placeholder="Note"
                  value={depositForm.note}
                  onChange={(event) =>
                    setDepositForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary flex-1"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      addDepositAction(initData, {
                        shortcode: code,
                        amount: Number(depositForm.amount),
                        note: depositForm.note || undefined,
                      }),
                    )
                  }
                >
                  Add
                </button>
                <button
                  type="button"
                  className="btn btn-sm flex-1"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      reduceDepositAction(initData, {
                        shortcode: code,
                        amount: Number(depositForm.amount),
                        note: depositForm.note || undefined,
                      }),
                    )
                  }
                >
                  Reduce
                </button>
              </div>
              {data.depositHistory.slice(0, 6).map((tx) => (
                <p key={tx.id} className="text-xs opacity-70">
                  {tx.type} <Money amount={tx.amount} /> →{" "}
                  <Money amount={tx.balance_after} />
                  {tx.note ? ` · ${tx.note}` : ""}
                </p>
              ))}
            </div>
          </section>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">YouTube</h2>
              <ul className="flex flex-col gap-2">
                {data.youtubeMonths.map((month) => (
                  <li key={month.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {month.month.slice(0, 7)} · <Money amount={month.fee} />
                      <span className="opacity-60">
                        {month.paid ? " · paid" : " · unpaid"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-xs"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          toggleYoutubeMonthAction(initData, {
                            shortcode: code,
                            month: month.month,
                            paid: !month.paid,
                            settle: month.paid ? undefined : settle,
                          }),
                        )
                      }
                    >
                      {month.paid ? "Unpaid" : "Paid"}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-sm mt-2"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    toggleAllYoutubeAction(initData, {
                      shortcode: code,
                      paid: true,
                      settle,
                    }),
                  )
                }
              >
                Mark all YouTube paid
              </button>
            </div>
          </section>

          <SettleFields value={settle} onChange={setSettle} />

          <button
            type="button"
            className="btn btn-error"
            onClick={() => setConfirmPayAll(true)}
          >
            Clear all debts + YouTube
          </button>

          <section className="card bg-base-100 border border-base-300">
            <div className="card-body py-4">
              <h2 className="card-title text-base">User</h2>
              <input
                className="input input-sm"
                placeholder="First name"
                value={userForm.first_name}
                onChange={(event) =>
                  patchUserForm("first_name", event.target.value)
                }
              />
              <input
                className="input input-sm"
                placeholder="Last name"
                value={userForm.last_name}
                onChange={(event) =>
                  patchUserForm("last_name", event.target.value)
                }
              />
              <input
                className="input input-sm"
                placeholder="Username"
                value={userForm.telegram_username}
                onChange={(event) =>
                  patchUserForm("telegram_username", event.target.value)
                }
              />
              <input
                className="input input-sm"
                placeholder="Telegram user id"
                value={userForm.telegram_user_id}
                onChange={(event) =>
                  patchUserForm("telegram_user_id", event.target.value)
                }
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    await run(() =>
                      updateUserAction(initData, {
                        shortcode: code,
                        field: "first_name",
                        value: userForm.first_name,
                      }),
                    );
                    await run(() =>
                      updateUserAction(initData, {
                        shortcode: code,
                        field: "last_name",
                        value: userForm.last_name,
                      }),
                    );
                    await run(() =>
                      updateUserAction(initData, {
                        shortcode: code,
                        field: "telegram_username",
                        value: userForm.telegram_username,
                      }),
                    );
                    await run(() =>
                      updateUserAction(initData, {
                        shortcode: code,
                        field: "telegram_user_id",
                        value: userForm.telegram_user_id || "clear",
                      }),
                    );
                  })();
                }}
              >
                Save user
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmPayAll}
        title={`Clear ${code}?`}
        body="This marks every debt and YouTube month paid, then applies the settlement mode below."
        confirmLabel="Clear everything"
        busy={busy}
        onCancel={() => setConfirmPayAll(false)}
        onConfirm={() => {
          setConfirmPayAll(false);
          void run(
            () => payAllAction(initData, { shortcode: code, settle }),
            "Cleared",
          );
        }}
      />
    </OwnerGuard>
  );
}
