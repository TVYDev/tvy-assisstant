import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn().mockResolvedValue({ data: 25, error: null }),
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
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

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ data: 25, error: null });
});

function makeChain(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    data: null,
    error: null,
    ...overrides,
  };
  const q: Record<string, unknown> = {};
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.order = vi.fn().mockReturnValue(q);
  q.upsert = vi.fn().mockResolvedValue({ error: null });
  q.insert = vi.fn().mockResolvedValue({ error: null });
  q.maybeSingle = vi.fn().mockResolvedValue(base);
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(base).then(resolve);
  return q;
}

describe("addDeposit", () => {
  it("increments balance via RPC and logs an add transaction", async () => {
    mockFrom.mockImplementation(() => makeChain());

    const balance = await addDeposit("bsr", 25);

    expect(mockRpc).toHaveBeenCalledWith("increment_deposit_balance", {
      p_shortcode: "BSR",
      p_amount: 25,
    });
    expect(mockFrom).toHaveBeenCalledWith("deposit_transactions");
    expect(balance).toBe(25);
  });

  it("throws when RPC fails", async () => {
    mockFrom.mockImplementation(() => makeChain());
    mockRpc.mockResolvedValue({ data: null, error: { message: "rpc failed" } });

    await expect(addDeposit("BSR", 10)).rejects.toThrow("rpc failed");
  });
});

describe("reduceDeposit", () => {
  it("decrements balance via RPC and logs a reduce transaction", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "deposit_balances") {
        return makeChain({ data: { balance: "30.00" }, error: null });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: 15, error: null });

    const balance = await reduceDeposit("bsr", 15, "Applied to debt");

    expect(mockRpc).toHaveBeenCalledWith("decrement_deposit_balance", {
      p_shortcode: "BSR",
      p_amount: 15,
    });
    expect(mockFrom).toHaveBeenCalledWith("deposit_transactions");
    expect(balance).toBe(15);
  });

  it("throws InsufficientDepositError when balance is too low", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "deposit_balances") {
        return makeChain({ data: { balance: "5.00" }, error: null });
      }
      return makeChain();
    });

    await expect(reduceDeposit("BSR", 10)).rejects.toBeInstanceOf(
      InsufficientDepositError,
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("throws InsufficientDepositError when RPC reports insufficient balance", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "deposit_balances") {
        return makeChain({ data: { balance: "10.00" }, error: null });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "insufficient_deposit_balance" },
    });

    await expect(reduceDeposit("BSR", 10)).rejects.toBeInstanceOf(
      InsufficientDepositError,
    );
  });
});

describe("getDepositBalanceByShortcode", () => {
  it("returns stored balance", async () => {
    mockFrom.mockImplementation(() =>
      makeChain({ data: { balance: "42.50" }, error: null }),
    );

    const balance = await getDepositBalanceByShortcode("bsr");
    expect(balance).toBe(42.5);
  });

  it("returns 0 when no balance row exists", async () => {
    mockFrom.mockImplementation(() =>
      makeChain({ data: null, error: null }),
    );

    const balance = await getDepositBalanceByShortcode("nobody");
    expect(balance).toBe(0);
  });
});

describe("getDepositTransactions", () => {
  it("returns mapped transactions newest first", async () => {
    mockFrom.mockImplementation(() =>
      makeChain({
        data: [
          {
            id: 2,
            shortcode: "BSR",
            type: "reduce",
            amount: "10.00",
            balance_after: "15.00",
            note: "Lunch",
            created_at: "2026-06-12T10:00:00Z",
          },
          {
            id: 1,
            shortcode: "BSR",
            type: "add",
            amount: "25.00",
            balance_after: "25.00",
            note: null,
            created_at: "2026-06-11T10:00:00Z",
          },
        ],
        error: null,
      }),
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
    mockFrom.mockImplementation((table: string) => {
      if (table === "deposit_balances") {
        return makeChain({ data: { balance: "30.00" }, error: null });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: 10, error: null });

    const result = await applyDepositTowardPayment("BSR", 25, "Debt paid");
    expect(result).toEqual({ applied: 25, balance: 10 });
    expect(mockRpc).toHaveBeenCalledWith("decrement_deposit_balance", {
      p_shortcode: "BSR",
      p_amount: 25,
    });
  });

  it("applies partial deposit when balance is lower than payment", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "deposit_balances") {
        return makeChain({ data: { balance: "10.00" }, error: null });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ data: 0, error: null });

    const result = await applyDepositTowardPayment("BSR", 25, "Debt paid");
    expect(result).toEqual({ applied: 10, balance: 0 });
  });

  it("does nothing when deposit balance is zero", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "deposit_balances") {
        return makeChain({ data: { balance: "0" }, error: null });
      }
      return makeChain();
    });

    const result = await applyDepositTowardPayment("BSR", 25, "Debt paid");
    expect(result).toEqual({ applied: 0, balance: 0 });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("getAllDepositTotals", () => {
  it("reads current balances from deposit_balances", async () => {
    mockFrom.mockImplementation(() =>
      makeChain({
        data: [
          { shortcode: "BSR", balance: "15.00" },
          { shortcode: "PVS", balance: "20.00" },
        ],
        error: null,
      }),
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
