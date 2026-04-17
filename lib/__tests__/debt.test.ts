import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock fns so they're available inside the vi.mock factory ────────────
const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("../supabase", () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import {
  addDebt,
  toggleDebtItemPaid,
  getDebtByShortcode,
  markAllPaid,
  cancelDebtItem,
  updateDebtItem,
  getAllDebtRecords,
} from "../debt";

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    data: null,
    error: null,
    ...overrides,
  };
  const q: Record<string, unknown> = {};
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.ilike = vi.fn().mockReturnValue(q);
  q.order = vi.fn().mockReturnValue(q);
  q.upsert = vi.fn().mockResolvedValue({ error: null });
  q.insert = vi.fn().mockResolvedValue({ error: null });
  q.update = vi.fn().mockReturnValue(q);
  q.delete = vi.fn().mockReturnValue(q);
  q.single = vi.fn().mockResolvedValue(base);
  q.maybeSingle = vi.fn().mockResolvedValue(base);
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(base).then(resolve);
  return q;
}

// ── addDebt ───────────────────────────────────────────────────────────────────

describe("addDebt", () => {
  it("creates user stub, upserts record, inserts item, and increments owes_me", async () => {
    const recChain = makeChain({ data: { id: 42 }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "telegram_users") return makeChain();
      if (table === "debt_records") return recChain;
      if (table === "debt_items") return makeChain();
      return makeChain();
    });
    mockRpc.mockResolvedValue({ error: null });

    await addDebt("bsr", 15.5, "Lunch");

    // debt_items.insert called once
    const debtItemsCalls = mockFrom.mock.calls.filter(
      ([t]: [string]) => t === "debt_items",
    );
    expect(debtItemsCalls.length).toBeGreaterThan(0);

    // rpc called with increment_owes_me
    expect(mockRpc).toHaveBeenCalledWith("increment_owes_me", {
      p_shortcode: "BSR",
      p_amount: 15.5,
    });
  });

  it("uppercases the shortcode", async () => {
    const recChain = makeChain({ data: { id: 1 }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "debt_records") return recChain;
      return makeChain();
    });
    mockRpc.mockResolvedValue({ error: null });

    await addDebt("abc", 5, "Coffee");

    expect(mockRpc).toHaveBeenCalledWith(
      "increment_owes_me",
      expect.objectContaining({ p_shortcode: "ABC" }),
    );
  });

  it("throws when getting debt record fails", async () => {
    const errChain = makeChain({ data: null, error: { message: "DB down" } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "debt_records") return errChain;
      return makeChain();
    });

    await expect(addDebt("BSR", 10, "test")).rejects.toThrow("DB down");
  });
});

// ── toggleDebtItemPaid ────────────────────────────────────────────────────────

describe("toggleDebtItemPaid", () => {
  const item = { id: 7, amount: 20, paid: false, debt_record_id: 3 };
  const rec = { shortcode: "BSR" };

  function setupMocks() {
    mockFrom.mockImplementation((table: string) => {
      if (table === "debt_items") {
        return makeChain({ data: item, error: null });
      }
      if (table === "debt_records") {
        return makeChain({ data: rec, error: null });
      }
      return makeChain();
    });
    mockRpc.mockResolvedValue({ error: null });
  }

  it("returns shortcode and amount", async () => {
    setupMocks();
    const result = await toggleDebtItemPaid(7, true);
    expect(result).toEqual({ shortcode: "BSR", amount: 20 });
  });

  it("calls decrement_owes_me when marking paid", async () => {
    setupMocks();
    await toggleDebtItemPaid(7, true);
    expect(mockRpc).toHaveBeenCalledWith("decrement_owes_me", {
      p_shortcode: "BSR",
      p_amount: 20,
    });
  });

  it("calls increment_owes_me when marking unpaid", async () => {
    setupMocks();
    await toggleDebtItemPaid(7, false);
    expect(mockRpc).toHaveBeenCalledWith("increment_owes_me", {
      p_shortcode: "BSR",
      p_amount: 20,
    });
  });

  it("returns null when item not found", async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }));
    const result = await toggleDebtItemPaid(999, true);
    expect(result).toBeNull();
  });
});

// ── getDebtByShortcode ────────────────────────────────────────────────────────

describe("getDebtByShortcode", () => {
  it("returns null when no record found", async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }));
    const result = await getDebtByShortcode("NOBODY");
    expect(result).toBeNull();
  });

  it("maps record correctly", async () => {
    const dbRow = {
      owes_me: "25.00",
      i_owe: "0",
      debt_items: [
        {
          id: 1,
          description: "Lunch",
          amount: "25.00",
          date: "2026-04-01",
          paid: false,
        },
      ],
      telegram_users: [{ first_name: "Bob", last_name: "Smith" }],
    };
    mockFrom.mockImplementation(() => makeChain({ data: dbRow, error: null }));
    const result = await getDebtByShortcode("BSR");
    expect(result).not.toBeNull();
    expect(result!.shortcode).toBe("BSR");
    expect(result!.owes_me).toBe(25);
    expect(result!.name).toBe("Bob Smith");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].description).toBe("Lunch");
  });

  it("falls back to shortcode as name when telegram_users is empty", async () => {
    const dbRow = {
      owes_me: "10",
      i_owe: "0",
      debt_items: [],
      telegram_users: [],
    };
    mockFrom.mockImplementation(() => makeChain({ data: dbRow, error: null }));
    const result = await getDebtByShortcode("xyz");
    expect(result!.name).toBe("XYZ");
  });

  it("throws on supabase error", async () => {
    mockFrom.mockImplementation(() =>
      makeChain({ data: null, error: { message: "connection error" } }),
    );
    await expect(getDebtByShortcode("ERR")).rejects.toThrow("connection error");
  });
});

// ── markAllPaid ───────────────────────────────────────────────────────────────

describe("markAllPaid", () => {
  it("deletes all items and resets totals", async () => {
    const chain = makeChain({ data: { id: 5 }, error: null });
    mockFrom.mockReturnValue(chain);

    await markAllPaid("BSR");

    expect(mockFrom).toHaveBeenCalledWith("debt_items");
    expect(mockFrom).toHaveBeenCalledWith("debt_records");
  });

  it("throws when record not found", async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }));
    await expect(markAllPaid("GHOST")).rejects.toThrow(
      "No debt record for GHOST",
    );
  });
});

// ── cancelDebtItem ────────────────────────────────────────────────────────────

describe("cancelDebtItem", () => {
  const item = { id: 3, amount: 30, debt_record_id: 10 };
  const rec = { shortcode: "PVS" };

  it("deletes item and decrements owes_me, returns shortcode and amount", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "debt_items") return makeChain({ data: item, error: null });
      if (table === "debt_records")
        return makeChain({ data: rec, error: null });
      return makeChain();
    });
    mockRpc.mockResolvedValue({ error: null });

    const result = await cancelDebtItem(3);
    expect(result).toEqual({ shortcode: "PVS", amount: 30 });
    expect(mockRpc).toHaveBeenCalledWith("decrement_owes_me", {
      p_shortcode: "PVS",
      p_amount: 30,
    });
  });

  it("returns null when item not found", async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }));
    const result = await cancelDebtItem(999);
    expect(result).toBeNull();
  });
});

// ── updateDebtItem ────────────────────────────────────────────────────────────

describe("updateDebtItem", () => {
  const unpaidItem = { id: 5, amount: 20, paid: false, debt_record_id: 2 };
  const paidItem = { id: 6, amount: 20, paid: true, debt_record_id: 2 };
  const rec = { shortcode: "TST" };

  function setupWith(item: typeof unpaidItem | typeof paidItem) {
    mockFrom.mockImplementation((table: string) => {
      if (table === "debt_items") return makeChain({ data: item, error: null });
      if (table === "debt_records")
        return makeChain({ data: rec, error: null });
      return makeChain();
    });
    mockRpc.mockResolvedValue({ error: null });
  }

  it("returns null when item not found", async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }));
    expect(await updateDebtItem(999, 10, "x")).toBeNull();
  });

  it("returns old and new amounts", async () => {
    setupWith(unpaidItem);
    const result = await updateDebtItem(5, 35, "Updated description");
    expect(result).toEqual({ shortcode: "TST", oldAmount: 20, newAmount: 35 });
  });

  it("increments owes_me when new amount is higher (unpaid)", async () => {
    setupWith(unpaidItem);
    await updateDebtItem(5, 30, "More expensive");
    expect(mockRpc).toHaveBeenCalledWith("increment_owes_me", {
      p_shortcode: "TST",
      p_amount: 10, // 30 - 20
    });
  });

  it("decrements owes_me when new amount is lower (unpaid)", async () => {
    setupWith(unpaidItem);
    await updateDebtItem(5, 15, "Cheaper");
    expect(mockRpc).toHaveBeenCalledWith("decrement_owes_me", {
      p_shortcode: "TST",
      p_amount: 5, // 20 - 15
    });
  });

  it("does NOT call rpc when amount unchanged (unpaid)", async () => {
    setupWith(unpaidItem);
    await updateDebtItem(5, 20, "Same amount");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does NOT call rpc for a paid item even if amount changes", async () => {
    setupWith(paidItem);
    await updateDebtItem(6, 50, "Paid item changed");
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ── getAllDebtRecords ─────────────────────────────────────────────────────────

describe("getAllDebtRecords", () => {
  it("returns empty array when no records", async () => {
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null }));
    const result = await getAllDebtRecords();
    expect(result).toEqual([]);
  });

  it("maps all records correctly", async () => {
    const rows = [
      {
        shortcode: "AAA",
        owes_me: "10",
        i_owe: "0",
        debt_items: [],
        telegram_users: [{ first_name: "Alice" }],
      },
      {
        shortcode: "BBB",
        owes_me: "5",
        i_owe: "2",
        debt_items: [
          {
            id: 1,
            description: "Pizza",
            amount: "5",
            date: "2026-04-10",
            paid: false,
          },
        ],
        telegram_users: null,
      },
    ];
    mockFrom.mockImplementation(() => makeChain({ data: rows, error: null }));
    const result = await getAllDebtRecords();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[0].owes_me).toBe(10);
    expect(result[1].name).toBe("BBB");
    expect(result[1].items).toHaveLength(1);
  });

  it("throws on error", async () => {
    mockFrom.mockImplementation(() =>
      makeChain({ data: null, error: { message: "fail" } }),
    );
    await expect(getAllDebtRecords()).rejects.toThrow("fail");
  });
});
