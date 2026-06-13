import { describe, it, expect, vi } from "vitest";

vi.mock("../supabase", () => ({
  supabase: {},
}));

import { buildReminderMessage } from "../youtube-subscription";

describe("buildReminderMessage", () => {
  const fee = 1.19;

  it("renders one line per person with bold pay amount", () => {
    const msg = buildReminderMessage([{ id: "EKV", unpaid_count: 1 }], fee);
    expect(msg).not.toContain("<pre>");
    expect(msg).toContain("<b>EKV</b>");
    expect(msg).toContain("1 month");
    expect(msg).toContain("To Pay <b>$1.19</b>");
    expect(msg).not.toContain("Total to collect");
  });

  it("shows deposit breakdown on a second line when deposit applies", () => {
    const msg = buildReminderMessage(
      [{ id: "BSR", unpaid_count: 1 }],
      fee,
      new Map([["BSR", 0.71]]),
    );
    expect(msg).toContain("$0.71");
    expect(msg).toContain("To Pay <b>$0.48</b>");
    expect(msg).not.toContain("Total to collect");
  });

  it("shows Settled when deposit fully covers YouTube owed", () => {
    const msg = buildReminderMessage(
      [{ id: "BSR", unpaid_count: 1 }],
      fee,
      new Map([["BSR", 2.0]]),
    );
    expect(msg).toContain("✅");
    expect(msg).toContain("<b>Settled</b>");
    expect(msg).not.toContain("Total to collect");
  });

  it("sums net pay across multiple members with blank lines between", () => {
    const msg = buildReminderMessage(
      [
        { id: "EKV", unpaid_count: 1 },
        { id: "MKR", unpaid_count: 1 },
        { id: "TLH", unpaid_count: 2 },
      ],
      fee,
    );
    expect(msg).toContain("EKV");
    expect(msg).toContain("MKR");
    expect(msg).toContain("2 months");
    expect(msg).toContain("To Pay <b>$2.38</b>");
    expect(msg).not.toContain("Total to collect");
    expect(msg).toMatch(/MKR[\s\S]*\n\n[\s\S]*TLH/);
  });

  it("returns all-paid message when nobody owes", () => {
    const msg = buildReminderMessage([{ id: "BSR", unpaid_count: 0 }], fee);
    expect(msg).toContain("everyone's paid up");
  });
});
