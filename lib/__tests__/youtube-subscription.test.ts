import { describe, it, expect, vi } from "vitest";

vi.mock("../supabase", () => ({
  supabase: {},
}));

vi.mock("../youtube-fee", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../youtube-fee")>();
  return actual;
});

import { buildReminderMessage } from "../youtube-subscription";

describe("buildReminderMessage", () => {
  it("shows monthly fee when all unpaid months share one rate", () => {
    const msg = buildReminderMessage([
      {
        id: "EKV",
        months: [{ month: "2026-05-01", fee: 1.19 }],
        total: 1.19,
      },
    ]);
    expect(msg).toContain("1 month × $1.19");
    expect(msg).toContain("<u>👉 To Pay $1.19</u>");
  });

  it("shows per-month fees when rates differ", () => {
    const msg = buildReminderMessage([
      {
        id: "TLH",
        months: [
          { month: "2026-05-01", fee: 1.19 },
          { month: "2026-06-01", fee: 1.49 },
        ],
        total: 2.68,
      },
    ]);
    expect(msg).toContain("2 months");
    expect(msg).not.toContain("2 months ×");
    expect(msg).toContain("1 month × $1.19");
    expect(msg).toContain("1 month × $1.49");
    expect(msg).not.toContain("2026-05");
    expect(msg).toContain("<u>👉 To Pay $2.68</u>");
  });

  it("shows deposit breakdown with mixed monthly fees", () => {
    const msg = buildReminderMessage(
      [
        {
          id: "BSR",
          months: [
            { month: "2026-05-01", fee: 1.19 },
            { month: "2026-06-01", fee: 1.49 },
          ],
          total: 2.68,
        },
      ],
      new Map([["BSR", 1.0]]),
    );
    expect(msg).toContain("<b>BSR</b>");
    expect(msg).toContain("<b><u>👉 To Pay $1.68</u></b>");
    expect(msg).toContain("1 month × $1.19");
    expect(msg).toContain("1 month × $1.49");
    expect(msg).toContain("deposit $1.00");
    expect(msg).not.toContain("total");
  });

  it("shows Settled when deposit fully covers YouTube owed", () => {
    const msg = buildReminderMessage(
      [
        {
          id: "ABC",
          months: [{ month: "2026-06-01", fee: 1.49 }],
          total: 1.49,
        },
      ],
      new Map([["ABC", 2.0]]),
    );
    expect(msg).toContain("<b>Settled</b>");
    expect(msg).toContain("1 month × $1.49");
  });

  it("adds blank lines between members", () => {
    const msg = buildReminderMessage([
      {
        id: "EKV",
        months: [{ month: "2026-05-01", fee: 1.19 }],
        total: 1.19,
      },
      {
        id: "TLH",
        months: [
          { month: "2026-05-01", fee: 1.19 },
          { month: "2026-06-01", fee: 1.49 },
        ],
        total: 2.68,
      },
    ]);
    expect(msg).toMatch(/EKV[\s\S]*\n\n[\s\S]*TLH/);
  });

  it("returns all-paid message when nobody owes", () => {
    const msg = buildReminderMessage([]);
    expect(msg).toContain("everyone's paid up");
  });
});
