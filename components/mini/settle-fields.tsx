"use client";

import type { SettleInput } from "@/lib/mini-app/mutations";

export function SettleFields({
  value,
  onChange,
}: {
  value: SettleInput;
  onChange: (next: SettleInput) => void;
}) {
  return (
    <fieldset className="fieldset bg-base-200 rounded-box p-3">
      <legend className="fieldset-legend">Settlement</legend>
      <div className="join join-vertical sm:join-horizontal w-full">
        {(
          [
            ["mark_only", "Mark only"],
            ["use_deposit", "From deposit"],
            ["received_cash", "Cash in"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`join-item btn btn-sm ${value.mode === mode ? "btn-primary" : ""}`}
            onClick={() => onChange({ ...value, mode })}
          >
            {label}
          </button>
        ))}
      </div>
      {value.mode === "received_cash" && (
        <label className="floating-label mt-2">
          <span>Amount received</span>
          <input
            className="input input-sm w-full"
            type="number"
            min="0.01"
            step="0.01"
            value={value.received ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                received: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </label>
      )}
    </fieldset>
  );
}
