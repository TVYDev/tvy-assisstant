"use client";

import type { OweSnapshot } from "@/lib/owe-message";
import { Money } from "./money";

export function SnapshotCards({ snapshot }: { snapshot: OweSnapshot }) {
  const netTone =
    snapshot.netOwed > 0
      ? "text-error"
      : snapshot.netOwed < 0
        ? "text-success"
        : "text-base-content";

  if (!snapshot.hasRecord) {
    return (
      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title">No tab yet</h2>
          <p className="text-sm opacity-70">
            Dino has no ledger, YouTube, or deposit record for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card bg-base-200">
        <div className="card-body py-5">
          <p className="text-sm opacity-70">Net with Vannyou</p>
          <p className={`text-4xl font-bold tracking-tight ${netTone}`}>
            <Money amount={snapshot.netOwed} />
          </p>
          <p className="text-sm">
            {snapshot.netOwed > 0
              ? "Please settle when you can."
              : snapshot.netOwed < 0
                ? "Vannyou owes you this amount."
                : "You're all settled."}
          </p>
        </div>
      </div>

      {snapshot.unpaidItems.length > 0 && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body py-4">
            <h2 className="card-title text-base">
              Debts <Money amount={snapshot.owesMe} />
            </h2>
            <ul className="flex flex-col gap-2">
              {snapshot.unpaidItems.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-sm">
                  <span>
                    {item.description}
                    <span className="block text-xs opacity-60">{item.date}</span>
                  </span>
                  <Money amount={item.amount} className="font-medium" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {snapshot.iOwe > 0 && (
        <div className="alert alert-success">
          <span>
            Vannyou owes you <Money amount={snapshot.iOwe} className="font-semibold" />
          </span>
        </div>
      )}

      {snapshot.youtubeMonths.length > 0 && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body py-4">
            <h2 className="card-title text-base">
              YouTube <Money amount={snapshot.youtubeTotal} />
            </h2>
            <ul className="flex flex-col gap-1 text-sm">
              {snapshot.youtubeMonths.map((month) => (
                <li key={month.month} className="flex justify-between">
                  <span>{month.month.slice(0, 7)}</span>
                  <Money amount={month.fee} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {snapshot.deposit > 0 && (
        <div className="alert">
          <span>
            Deposit on file: <Money amount={snapshot.deposit} className="font-semibold" />
          </span>
        </div>
      )}
    </div>
  );
}
