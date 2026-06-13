import { describe, it, expect, vi } from "vitest";

vi.mock("../supabase", () => ({
  supabase: {},
}));

import {
  resolveFeeForMonth,
  sumMonthCharges,
  formatYoutubeMonthSummary,
  normalizeDate,
  type YoutubeFeeSchedule,
} from "../youtube-fee";

const schedules: YoutubeFeeSchedule[] = [
  {
    id: 1,
    fee: 1.19,
    effective_from: "2020-01-01",
    effective_to: "2026-05-31",
  },
  {
    id: 2,
    fee: 1.49,
    effective_from: "2026-06-15",
    effective_to: null,
  },
];

describe("resolveFeeForMonth", () => {
  it("uses the fee whose date range overlaps the subscription month", () => {
    expect(resolveFeeForMonth(schedules, "2026-05")).toBe(1.19);
    expect(resolveFeeForMonth(schedules, "2026-06")).toBe(1.49);
  });

  it("keeps the old rate when effective date is after the subscription month", () => {
    const midMonthSchedules: YoutubeFeeSchedule[] = [
      {
        id: 1,
        fee: 1.19,
        effective_from: "2020-01-01",
        effective_to: null,
      },
      {
        id: 2,
        fee: 1.49,
        effective_from: "2026-07-01",
        effective_to: null,
      },
    ];
    expect(resolveFeeForMonth(midMonthSchedules, "2026-06")).toBe(1.19);
    expect(resolveFeeForMonth(midMonthSchedules, "2026-07")).toBe(1.49);
  });

  it("throws when no schedule covers the month", () => {
    expect(() =>
      resolveFeeForMonth(
        [{ id: 1, fee: 1.19, effective_from: "2026-06-01", effective_to: null }],
        "2026-05",
      ),
    ).toThrow(/No YouTube fee schedule/);
  });
});

describe("sumMonthCharges", () => {
  it("totals unpaid months at their respective rates", () => {
    const owing = sumMonthCharges(
      [
        { month: "2026-05-01", paid: false },
        { month: "2026-06-01", paid: false },
        { month: "2026-04-01", paid: true },
      ],
      schedules,
      true,
    );

    expect(owing.total).toBeCloseTo(2.68);
    expect(owing.months).toHaveLength(2);
  });
});

describe("formatYoutubeMonthSummary", () => {
  it("shows a single rate when all months share it", () => {
    const text = formatYoutubeMonthSummary({
      total: 2.38,
      months: [
        { month: "2026-05-01", fee: 1.19 },
        { month: "2026-06-01", fee: 1.19 },
      ],
    });
    expect(text).toBe("2 month(s) × $1.19/month");
  });

  it("shows a breakdown when rates differ", () => {
    const text = formatYoutubeMonthSummary({
      total: 2.68,
      months: [
        { month: "2026-05-01", fee: 1.19 },
        { month: "2026-06-01", fee: 1.49 },
      ],
    });
    expect(text).toContain("2026-05 × $1.19");
    expect(text).toContain("2026-06 × $1.49");
  });
});

describe("normalizeDate", () => {
  it("accepts YYYY-MM and YYYY-MM-DD", () => {
    expect(normalizeDate("2026-06")).toBe("2026-06-01");
    expect(normalizeDate("2026-06-15")).toBe("2026-06-15");
  });
});
