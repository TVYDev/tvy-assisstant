import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockIncrementOwesMe,
  mockDecrementOwesMe,
  mockFindDebtRecord,
  mockFindDebtRecords,
  mockFindDebtItem,
  mockInsert,
  mockUpdate,
  mockDelete,
} = vi.hoisted(() => ({
  mockIncrementOwesMe: vi.fn().mockResolvedValue(0),
  mockDecrementOwesMe: vi.fn().mockResolvedValue(0),
  mockFindDebtRecord: vi.fn(),
  mockFindDebtRecords: vi.fn(),
  mockFindDebtItem: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    query: {
      debtRecords: {
        findFirst: mockFindDebtRecord,
        findMany: mockFindDebtRecords,
      },
      debtItems: { findFirst: mockFindDebtItem },
      telegramUsers: { findFirst: vi.fn() },
    },
  }),
}));

vi.mock("../db/rpc", () => ({
  incrementOwesMe: mockIncrementOwesMe,
  decrementOwesMe: mockDecrementOwesMe,
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

function insertChain() {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function updateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function deleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockImplementation(() => insertChain());
  mockUpdate.mockImplementation(() => updateChain());
  mockDelete.mockImplementation(() => deleteChain());
  mockIncrementOwesMe.mockResolvedValue(0);
  mockDecrementOwesMe.mockResolvedValue(0);
});

describe("addDebt", () => {
  it("creates user stub, upserts record, inserts item, and increments owes_me", async () => {
    mockFindDebtRecord.mockResolvedValue({ id: 42 });

    await addDebt("bsr", 15.5, "Lunch");

    expect(mockInsert).toHaveBeenCalled();
    expect(mockIncrementOwesMe).toHaveBeenCalledWith("BSR", 15.5);
  });

  it("uppercases the shortcode", async () => {
    mockFindDebtRecord.mockResolvedValue({ id: 1 });

    await addDebt("abc", 5, "Coffee");

    expect(mockIncrementOwesMe).toHaveBeenCalledWith("ABC", 5);
  });

  it("throws when getting debt record fails", async () => {
    mockFindDebtRecord.mockRejectedValue(new Error("DB down"));

    await expect(addDebt("BSR", 10, "test")).rejects.toThrow("DB down");
  });
});

describe("toggleDebtItemPaid", () => {
  const item = { id: 7, amount: 20, paid: false, debtRecordId: 3 };
  const rec = { shortcode: "BSR" };

  function setupMocks() {
    mockFindDebtItem.mockResolvedValue(item);
    mockFindDebtRecord.mockResolvedValue(rec);
  }

  it("returns shortcode and amount", async () => {
    setupMocks();
    const result = await toggleDebtItemPaid(7, true);
    expect(result).toEqual({ shortcode: "BSR", amount: 20, newlyPaid: true });
  });

  it("calls decrement_owes_me when marking unpaid item paid", async () => {
    setupMocks();
    await toggleDebtItemPaid(7, true);
    expect(mockDecrementOwesMe).toHaveBeenCalledWith("BSR", 20);
  });

  it("calls increment_owes_me when marking paid item unpaid", async () => {
    mockFindDebtItem.mockResolvedValue({
      id: 7,
      amount: 20,
      paid: true,
      debtRecordId: 3,
    });
    mockFindDebtRecord.mockResolvedValue(rec);

    await toggleDebtItemPaid(7, false);
    expect(mockIncrementOwesMe).toHaveBeenCalledWith("BSR", 20);
  });

  it("does not adjust owes_me when item is already paid", async () => {
    mockFindDebtItem.mockResolvedValue({
      id: 7,
      amount: 20,
      paid: true,
      debtRecordId: 3,
    });
    mockFindDebtRecord.mockResolvedValue(rec);

    const result = await toggleDebtItemPaid(7, true);
    expect(result).toEqual({ shortcode: "BSR", amount: 20, newlyPaid: false });
    expect(mockIncrementOwesMe).not.toHaveBeenCalled();
    expect(mockDecrementOwesMe).not.toHaveBeenCalled();
  });

  it("returns null when item not found", async () => {
    mockFindDebtItem.mockResolvedValue(undefined);
    const result = await toggleDebtItemPaid(999, true);
    expect(result).toBeNull();
  });
});

describe("getDebtByShortcode", () => {
  it("returns null when no record found", async () => {
    mockFindDebtRecord.mockResolvedValue(undefined);
    const result = await getDebtByShortcode("NOBODY");
    expect(result).toBeNull();
  });

  it("maps record correctly", async () => {
    mockFindDebtRecord.mockResolvedValue({
      owesMe: 25,
      iOwe: 0,
      items: [
        {
          id: 1,
          description: "Lunch",
          amount: 25,
          date: "2026-04-01",
          paid: false,
        },
      ],
      user: { firstName: "Bob", lastName: "Smith" },
    });
    const result = await getDebtByShortcode("BSR");
    expect(result).not.toBeNull();
    expect(result!.shortcode).toBe("BSR");
    expect(result!.owes_me).toBe(25);
    expect(result!.name).toBe("Bob Smith");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].description).toBe("Lunch");
  });

  it("falls back to shortcode as name when telegram_users is empty", async () => {
    mockFindDebtRecord.mockResolvedValue({
      owesMe: 10,
      iOwe: 0,
      items: [],
      user: null,
    });
    const result = await getDebtByShortcode("xyz");
    expect(result!.name).toBe("XYZ");
  });

  it("throws on database error", async () => {
    mockFindDebtRecord.mockRejectedValue(new Error("connection error"));
    await expect(getDebtByShortcode("ERR")).rejects.toThrow("connection error");
  });
});

describe("markAllPaid", () => {
  it("deletes all items and resets totals", async () => {
    mockFindDebtRecord.mockResolvedValue({ id: 5 });

    await markAllPaid("BSR");

    expect(mockDelete).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("throws when record not found", async () => {
    mockFindDebtRecord.mockResolvedValue(undefined);
    await expect(markAllPaid("GHOST")).rejects.toThrow(
      "No debt record for GHOST",
    );
  });
});

describe("cancelDebtItem", () => {
  it("deletes item and decrements owes_me, returns shortcode and amount", async () => {
    mockFindDebtItem.mockResolvedValue({
      id: 3,
      amount: 30,
      debtRecordId: 10,
    });
    mockFindDebtRecord.mockResolvedValue({ shortcode: "PVS" });

    const result = await cancelDebtItem(3);
    expect(result).toEqual({ shortcode: "PVS", amount: 30 });
    expect(mockDecrementOwesMe).toHaveBeenCalledWith("PVS", 30);
  });

  it("returns null when item not found", async () => {
    mockFindDebtItem.mockResolvedValue(undefined);
    const result = await cancelDebtItem(999);
    expect(result).toBeNull();
  });
});

describe("updateDebtItem", () => {
  const unpaidItem = { id: 5, amount: 20, paid: false, debtRecordId: 2 };
  const paidItem = { id: 6, amount: 20, paid: true, debtRecordId: 2 };
  const rec = { shortcode: "TST" };

  function setupWith(item: typeof unpaidItem | typeof paidItem) {
    mockFindDebtItem.mockResolvedValue(item);
    mockFindDebtRecord.mockResolvedValue(rec);
  }

  it("returns null when item not found", async () => {
    mockFindDebtItem.mockResolvedValue(undefined);
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
    expect(mockIncrementOwesMe).toHaveBeenCalledWith("TST", 10);
  });

  it("decrements owes_me when new amount is lower (unpaid)", async () => {
    setupWith(unpaidItem);
    await updateDebtItem(5, 15, "Cheaper");
    expect(mockDecrementOwesMe).toHaveBeenCalledWith("TST", 5);
  });

  it("does NOT call rpc when amount unchanged (unpaid)", async () => {
    setupWith(unpaidItem);
    await updateDebtItem(5, 20, "Same amount");
    expect(mockIncrementOwesMe).not.toHaveBeenCalled();
    expect(mockDecrementOwesMe).not.toHaveBeenCalled();
  });

  it("does NOT call rpc for a paid item even if amount changes", async () => {
    setupWith(paidItem);
    await updateDebtItem(6, 50, "Paid item changed");
    expect(mockIncrementOwesMe).not.toHaveBeenCalled();
    expect(mockDecrementOwesMe).not.toHaveBeenCalled();
  });
});

describe("getAllDebtRecords", () => {
  it("returns empty array when no records", async () => {
    mockFindDebtRecords.mockResolvedValue([]);
    const result = await getAllDebtRecords();
    expect(result).toEqual([]);
  });

  it("maps all records correctly", async () => {
    mockFindDebtRecords.mockResolvedValue([
      {
        shortcode: "AAA",
        owesMe: 10,
        iOwe: 0,
        items: [],
        user: { firstName: "Alice", lastName: null },
      },
      {
        shortcode: "BBB",
        owesMe: 5,
        iOwe: 2,
        items: [
          {
            id: 1,
            description: "Pizza",
            amount: 5,
            date: "2026-04-10",
            paid: false,
          },
        ],
        user: null,
      },
    ]);
    const result = await getAllDebtRecords();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
    expect(result[0].owes_me).toBe(10);
    expect(result[1].name).toBe("BBB");
    expect(result[1].items).toHaveLength(1);
  });

  it("throws on error", async () => {
    mockFindDebtRecords.mockRejectedValue(new Error("fail"));
    await expect(getAllDebtRecords()).rejects.toThrow("fail");
  });
});
