import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveDepositForTelegramUser } = vi.hoisted(() => ({
  mockResolveDepositForTelegramUser: vi.fn().mockResolvedValue(0),
}));

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("../debt", () => ({
  getDebtByUserId: vi.fn(),
  getDebtByUsername: vi.fn(),
}));

vi.mock("../youtube-fee", () => ({
  getUnpaidYoutubeOwing: vi.fn(),
  formatYoutubeMonthSummary: (owing: { months: unknown[]; total: number }) =>
    `${owing.months.length} month(s) — $${owing.total.toFixed(2)}`,
}));

vi.mock("../youtube-subscription", () => ({
  getMemberByTelegramIdentity: vi.fn(),
  getMemberByUsername: vi.fn(),
}));

vi.mock("../deposit", () => ({
  resolveDepositForTelegramUser: mockResolveDepositForTelegramUser,
}));

import { buildOweMessage } from "../owe-message";
import { getDebtByUserId, getDebtByUsername } from "../debt";
import {
  getMemberByTelegramIdentity,
  getMemberByUsername,
} from "../youtube-subscription";
import { getUnpaidYoutubeOwing } from "../youtube-fee";
const mockGetDebtByUserId = vi.mocked(getDebtByUserId);
const mockGetDebtByUsername = vi.mocked(getDebtByUsername);
const mockGetMemberByTelegramIdentity = vi.mocked(getMemberByTelegramIdentity);
const mockGetMemberByUsername = vi.mocked(getMemberByUsername);
const mockGetUnpaidYoutubeOwing = vi.mocked(getUnpaidYoutubeOwing);

// ── shared fixtures ───────────────────────────────────────────────────────────

const NO_DEBT = null;
const NO_MEMBER = null;
const MONTHLY_FEE = 5.0;

function mockYoutubeOwing(months: number) {
  mockGetUnpaidYoutubeOwing.mockResolvedValue({
    total: months * MONTHLY_FEE,
    months: Array.from({ length: months }, (_, i) => ({
      month: `2026-0${i + 1}-01`,
      fee: MONTHLY_FEE,
    })),
  });
}

function debtRecord(overrides = {}) {
  return {
    shortcode: "TST",
    name: "Tester",
    owes_me: 25,
    i_owe: 0,
    items: [
      {
        id: 1,
        description: "Lunch",
        amount: 25,
        date: "2026-04-01",
        paid: false,
      },
    ],
    ...overrides,
  };
}

function ytMember(unpaid_count = 2) {
  return { id: "TST", unpaid_count };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUnpaidYoutubeOwing.mockResolvedValue({ total: 0, months: [] });
  mockResolveDepositForTelegramUser.mockResolvedValue(0);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("buildOweMessage", () => {
  it("returns null when no debt record and no subscription member", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toBeNull();
  });

  it("includes debt amount when user owes money (username miss, userId hit)", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(debtRecord());
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(mockGetDebtByUsername).toHaveBeenCalledWith("user");
    expect(mockGetDebtByUserId).toHaveBeenCalledWith(123);
    expect(result).toContain("$25.00");
    expect(result).toContain("Lunch");
  });

  it("includes YouTube unpaid info (username miss, userId hit)", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(ytMember(3));
    mockYoutubeOwing(3);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toContain("3 month(s)");
    expect(result).toContain("$15.00");
  });

  it("includes YouTube when username matches stub (no userId lookup for member)", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetMemberByUsername.mockResolvedValue(ytMember(3));
    mockYoutubeOwing(3);

    const result = await buildOweMessage(123, "user", "User");
    expect(mockGetMemberByUsername).toHaveBeenCalledWith("user");
    expect(mockGetMemberByTelegramIdentity).not.toHaveBeenCalled();
    expect(result).toContain("3 month(s)");
    expect(result).toContain("$15.00");
  });

  it("shows net total correctly when both debt and YouTube owed", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(
      debtRecord({ owes_me: 10, i_owe: 0 }),
    );
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(ytMember(2));
    mockYoutubeOwing(2);

    const result = await buildOweMessage(123, "user", "User");
    // net = 10 + 10 = 20
    expect(result).toContain("$20.00");
  });

  it("includes YouTube when debt and member both resolve via username", async () => {
    mockGetDebtByUsername.mockResolvedValue(
      debtRecord({ owes_me: 10, i_owe: 0 }),
    );
    mockGetMemberByUsername.mockResolvedValue(ytMember(2));
    mockYoutubeOwing(2);

    const result = await buildOweMessage(123, "user", "User");
    expect(mockGetDebtByUserId).not.toHaveBeenCalled();
    expect(mockGetMemberByTelegramIdentity).not.toHaveBeenCalled();
    expect(result).toContain("$20.00");
    expect(result).toContain("2 month(s)");
  });

  it("prefers debt from username when both username and userId would match", async () => {
    mockGetDebtByUsername.mockResolvedValue(
      debtRecord({ shortcode: "USR", name: "FromStub", owes_me: 1, i_owe: 0 }),
    );
    mockGetDebtByUserId.mockResolvedValue(debtRecord({ owes_me: 99, i_owe: 0 }));
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(mockGetDebtByUserId).not.toHaveBeenCalled();
    expect(result).toContain("FromStub");
    expect(result).toContain("$1.00");
    expect(result).not.toContain("$99.00");
  });

  it("shows 'Vannyou owes you' message when i_owe > 0", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(
      debtRecord({ owes_me: 0, i_owe: 15, items: [] }),
    );
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toContain("$15.00");
    expect(result?.toLowerCase()).toMatch(/vannyou|boss coupon|owes/);
  });

  it("shows all-settled message when net is zero", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(
      debtRecord({ owes_me: 0, i_owe: 0, items: [] }),
    );
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(ytMember(0));

    const result = await buildOweMessage(123, "user", "User");
    // one of the ALL_SETTLED messages — all contain zero-balance language
    expect(result).not.toBeNull();
    expect(result).toMatch(/clean|settled|zero|nothing|empty|peace|debt-free|free|nada|even/i);
  });

  it("uses username only when userId is 0", async () => {
    mockGetDebtByUsername.mockResolvedValue(debtRecord());
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(0, "user", "User");
    expect(mockGetDebtByUsername).toHaveBeenCalledWith("user");
    expect(mockGetDebtByUserId).not.toHaveBeenCalled();
    expect(mockGetMemberByTelegramIdentity).not.toHaveBeenCalled();
    expect(result).toContain("$25.00");
  });

  it("reduces net owed when user has a deposit", async () => {
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetDebtByUserId.mockResolvedValue(debtRecord({ owes_me: 50 }));
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);
    mockResolveDepositForTelegramUser.mockResolvedValue(20);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toContain("$20.00");
    expect(result).toContain("$30.00");
  });

  it("uses userId only when username is empty", async () => {
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "", "Friend");
    expect(mockGetDebtByUsername).not.toHaveBeenCalled();
    expect(mockGetMemberByUsername).not.toHaveBeenCalled();
    expect(mockGetDebtByUserId).toHaveBeenCalledWith(123);
    expect(mockGetMemberByTelegramIdentity).toHaveBeenCalledWith(123);
    expect(result).toBeNull();
  });
});
