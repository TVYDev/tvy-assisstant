import { describe, it, expect, vi } from "vitest";

vi.mock("../supabase", () => ({
  supabase: {},
}));

import { buildReminderMessage } from "../youtube-subscription";

describe("buildReminderMessage", () => {
  const fee = 1.19;
  const names = new Map([["BSR", "Sophia"], ["PVS", "John"]]);

  it("renders table with code, name, months, total, deposit, to pay", () => {
    const msg = buildReminderMessage(
      [{ id: "BSR", unpaid_count: 1 }],
      fee,
      new Map(),
      names,
    );
    expect(msg).toContain("<pre>");
    expect(msg).toContain("│ BSR ");
    expect(msg).toContain("Sophia");
    expect(msg).toContain("Total");
    expect(msg).toContain("To pay");
    expect(msg).toContain("$1.19");
    expect(msg).toContain("Total to collect: $1.19");
  });

  it("shows deposit offset and net to pay in table", () => {
    const msg = buildReminderMessage(
      [{ id: "BSR", unpaid_count: 1 }],
      fee,
      new Map([["BSR", 0.71]]),
      names,
    );
    expect(msg).toContain("$0.71");
    expect(msg).toContain("$0.48");
    expect(msg).toContain("Total to collect: $0.48");
  });

  it("shows Settled when deposit fully covers YouTube owed", () => {
    const msg = buildReminderMessage(
      [{ id: "BSR", unpaid_count: 1 }],
      fee,
      new Map([["BSR", 2.0]]),
      names,
    );
    expect(msg).toContain("Settled");
    expect(msg).not.toContain("│ OK ");
    expect(msg).toContain("all covered by deposits");
  });

  it("sums net pay across multiple members", () => {
    const msg = buildReminderMessage(
      [
        { id: "BSR", unpaid_count: 1 },
        { id: "PVS", unpaid_count: 2 },
      ],
      fee,
      new Map([["BSR", 0.71]]),
      names,
    );
    expect(msg).toContain("BSR");
    expect(msg).toContain("PVS");
    expect(msg).toContain("John");
    expect(msg).toContain("Total to collect: $2.86");
  });

  it("uses em dash when name is missing", () => {
    const msg = buildReminderMessage(
      [{ id: "XYZ", unpaid_count: 1 }],
      fee,
      new Map(),
      names,
    );
    expect(msg).toContain("│ XYZ ");
    expect(msg).toContain("—");
  });

  it("returns all-paid message when nobody owes", () => {
    const msg = buildReminderMessage(
      [{ id: "BSR", unpaid_count: 0 }],
      fee,
      new Map(),
      names,
    );
    expect(msg).toContain("everyone's paid up");
  });
});
