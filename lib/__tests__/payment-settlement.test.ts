import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../deposit", () => ({
  addDeposit: vi.fn(),
  applyDepositTowardPayment: vi.fn(),
  getDepositBalanceByShortcode: vi.fn(),
}));

import {
  parsePaymentTail,
  settlePayment,
  formatPaymentSettlement,
  isMonthToken,
} from "../payment-settlement";
import {
  addDeposit,
  applyDepositTowardPayment,
  getDepositBalanceByShortcode,
} from "../deposit";

const mockAddDeposit = vi.mocked(addDeposit);
const mockApplyDeposit = vi.mocked(applyDepositTowardPayment);
const mockGetBalance = vi.mocked(getDepositBalanceByShortcode);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBalance.mockResolvedValue(0);
});

describe("parsePaymentTail", () => {
  it("returns mark_only when no tail tokens", () => {
    expect(parsePaymentTail([])).toEqual({
      leading: [],
      tail: { mode: "mark_only" },
    });
  });

  it("parses deposit keyword", () => {
    expect(parsePaymentTail(["2026-04", "deposit"])).toEqual({
      leading: ["2026-04"],
      tail: { mode: "use_deposit" },
    });
  });

  it("parses trailing cash amount", () => {
    expect(parsePaymentTail(["2026-04", "1.19"])).toEqual({
      leading: ["2026-04"],
      tail: { mode: "received_cash", received: 1.19 },
    });
  });

  it("keeps YYYY-MM tokens as leading months", () => {
    expect(parsePaymentTail(["2026-01", "2026-02", "2026-03"])).toEqual({
      leading: ["2026-01", "2026-02", "2026-03"],
      tail: { mode: "mark_only" },
    });
  });
});

describe("isMonthToken", () => {
  it("accepts YYYY-MM only", () => {
    expect(isMonthToken("2026-04")).toBe(true);
    expect(isMonthToken("1.19")).toBe(false);
  });
});

describe("settlePayment", () => {
  it("does nothing on mark_only", async () => {
    const result = await settlePayment("BSR", 10, { mode: "mark_only" }, "Test");
    expect(result).toEqual({ added: 0, applied: 0, balance: 0 });
    expect(mockAddDeposit).not.toHaveBeenCalled();
    expect(mockApplyDeposit).not.toHaveBeenCalled();
  });

  it("uses deposit only", async () => {
    mockApplyDeposit.mockResolvedValue({ applied: 5, balance: 2 });
    const result = await settlePayment(
      "BSR",
      5,
      { mode: "use_deposit" },
      "YouTube",
    );
    expect(result).toEqual({ added: 0, applied: 5, balance: 2 });
    expect(mockApplyDeposit).toHaveBeenCalledWith("BSR", 5, "YouTube");
  });

  it("adds cash then settles from deposit", async () => {
    mockAddDeposit.mockResolvedValue(1.89);
    mockApplyDeposit.mockResolvedValue({ applied: 1.19, balance: 0.7 });
    const result = await settlePayment(
      "BSR",
      1.19,
      { mode: "received_cash", received: 1.19 },
      "YouTube 2026-04",
    );
    expect(mockAddDeposit).toHaveBeenCalledWith(
      "BSR",
      1.19,
      "YouTube 2026-04: received",
    );
    expect(result).toEqual({ added: 1.19, applied: 1.19, balance: 0.7 });
  });
});

describe("formatPaymentSettlement", () => {
  it("formats add and deduct lines", () => {
    expect(formatPaymentSettlement(1.19, 1.19, 0.7)).toBe(
      "\n💵 $1.19 received → deposit\n💰 $1.19 from deposit — $0.70 left",
    );
  });

  it("returns empty string when nothing moved", () => {
    expect(formatPaymentSettlement(0, 0, 0)).toBe("");
  });
});
