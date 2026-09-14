import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIncrementDeposit,
  mockDecrementDeposit,
  mockFindBalance,
  mockInsert,
  mockSelect,
} = vi.hoisted(() => ({
  mockIncrementDeposit: vi.fn().mockResolvedValue(25),
  mockDecrementDeposit: vi.fn().mockResolvedValue(15),
  mockFindBalance: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: mockInsert,
    query: {
      depositBalances: { findFirst: mockFindBalance },
      telegramUsers: { findFirst: vi.fn() },
    },
    select: mockSelect,
  }),
}));

vi.mock("../db/rpc", () => ({
  incrementDepositBalance: mockIncrementDeposit,
  decrementDepositBalance: mockDecrementDeposit,
}));

import {
  addDeposit,
  reduceDeposit,
  InsufficientDepositError,
  getDepositBalanceByShortcode,
  getDepositTransactions,
  getAllDepositTotals,
  applyDepositTowardPayment,
  formatDepositTransactionLine,
} from "../deposit";

function insertChain() {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function selectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockImplementation(() => insertChain());
  mockIncrementDeposit.mockResolvedValue(25);
  mockDecrementDeposit.mockResolvedValue(15);
});

describe("addDeposit", () => {
  it("increments balance via RPC and logs an add transaction", async () => {
    const balance = await addDeposit("bsr", 25);

    expect(mockIncrementDeposit).toHaveBeenCalledWith("BSR", 25);
    expect(mockInsert).toHaveBeenCalled();
    expect(balance).toBe(25);
  });

  it("throws when RPC fails", async () => {
    mockIncrementDeposit.mockRejectedValue(new Error("rpc failed"));

    await expect(addDeposit("BSR", 10)).rejects.toThrow("rpc failed");
  });
});

describe("reduceDeposit", () => {
  it("decrements balance via RPC and logs a reduce transaction", async () => {
    mockFindBalance.mockResolvedValue({ balance: 30 });
    mockDecrementDeposit.mockResolvedValue(15);

    const balance = await reduceDeposit("bsr", 15, "Applied to debt");

    expect(mockDecrementDeposit).toHaveBeenCalledWith("BSR", 15);
    expect(mockInsert).toHaveBeenCalled();
    expect(balance).toBe(15);
  });

  it("throws InsufficientDepositError when balance is too low", async () => {
    mockFindBalance.mockResolvedValue({ balance: 5 });

    await expect(reduceDeposit("BSR", 10)).rejects.toBeInstanceOf(
      InsufficientDepositError,
    );
    expect(mockDecrementDeposit).not.toHaveBeenCalled();
  });

  it("throws InsufficientDepositError when RPC reports insufficient balance", async () => {
    mockFindBalance.mockResolvedValue({ balance: 10 });
    mockDecrementDeposit.mockRejectedValue(
      new Error("insufficient_deposit_balance"),
    );

    await expect(reduceDeposit("BSR", 10)).rejects.toBeInstanceOf(
      InsufficientDepositError,
    );
  });
});

describe("getDepositBalanceByShortcode", () => {
  it("returns stored balance", async () => {
    mockFindBalance.mockResolvedValue({ balance: 42.5 });

    const balance = await getDepositBalanceByShortcode("bsr");
    expect(balance).toBe(42.5);
  });

  it("returns 0 when no balance row exists", async () => {
    mockFindBalance.mockResolvedValue(undefined);

    const balance = await getDepositBalanceByShortcode("nobody");
    expect(balance).toBe(0);
  });
});

describe("getDepositTransactions", () => {
  it("returns mapped transactions newest first", async () => {
    mockSelect.mockReturnValue(
      selectChain([
        {
          id: 2,
          shortcode: "BSR",
          type: "reduce",
          amount: 10,
          balanceAfter: 15,
          note: "Lunch",
          createdAt: "2026-06-12T10:00:00Z",
        },
        {
          id: 1,
          shortcode: "BSR",
          type: "add",
          amount: 25,
          balanceAfter: 25,
          note: null,
          createdAt: "2026-06-11T10:00:00Z",
        },
      ]),
    );

    const txs = await getDepositTransactions("bsr");
    expect(txs).toHaveLength(2);
    expect(txs[0].type).toBe("reduce");
    expect(txs[0].amount).toBe(10);
    expect(txs[1].type).toBe("add");
  });
});

describe("applyDepositTowardPayment", () => {
  it("reduces deposit up to the payment amount", async () => {
    mockFindBalance.mockResolvedValue({ balance: 30 });
    mockDecrementDeposit.mockResolvedValue(10);

    const result = await applyDepositTowardPayment("BSR", 25, "Debt paid");
    expect(result).toEqual({ applied: 25, balance: 10 });
    expect(mockDecrementDeposit).toHaveBeenCalledWith("BSR", 25);
  });

  it("applies partial deposit when balance is lower than payment", async () => {
    mockFindBalance.mockResolvedValue({ balance: 10 });
    mockDecrementDeposit.mockResolvedValue(0);

    const result = await applyDepositTowardPayment("BSR", 25, "Debt paid");
    expect(result).toEqual({ applied: 10, balance: 0 });
  });

  it("does nothing when deposit balance is zero", async () => {
    mockFindBalance.mockResolvedValue({ balance: 0 });

    const result = await applyDepositTowardPayment("BSR", 25, "Debt paid");
    expect(result).toEqual({ applied: 0, balance: 0 });
    expect(mockDecrementDeposit).not.toHaveBeenCalled();
  });
});

describe("getAllDepositTotals", () => {
  it("reads current balances from deposit_balances", async () => {
    mockSelect.mockReturnValue(
      selectChain([
        { shortcode: "BSR", balance: 15 },
        { shortcode: "PVS", balance: 20 },
      ]),
    );

    const totals = await getAllDepositTotals();
    expect(totals.get("BSR")).toBe(15);
    expect(totals.get("PVS")).toBe(20);
  });
});

describe("formatDepositTransactionLine", () => {
  it("formats add and reduce rows with emoji and Phnom Penh time", () => {
    expect(
      formatDepositTransactionLine({
        id: 1,
        shortcode: "EKV",
        type: "reduce",
        amount: 1.65,
        balance_after: 0.73,
        note: "YouTube 2026-08",
        created_at: "2026-08-01T10:00:00.000Z",
      }),
    ).toBe(
      "  📉 -$1.65 (2026-08-01 17:00) → $0.73 left — YouTube 2026-08",
    );

    expect(
      formatDepositTransactionLine({
        id: 2,
        shortcode: "EKV",
        type: "add",
        amount: 2.38,
        balance_after: 2.38,
        note: null,
        created_at: "2026-07-29T08:00:00.000Z",
      }),
    ).toBe("  📈 +$2.38 (2026-07-29 15:00) → $2.38 total");
  });
});
