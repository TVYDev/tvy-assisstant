import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock("../debt", () => ({
  getDebtByUserId: vi.fn(),
  getDebtByUsername: vi.fn(),
}));

vi.mock("../youtube-subscription", () => ({
  getMemberByTelegramIdentity: vi.fn(),
  getMemberByUsername: vi.fn(),
  getConfig: vi.fn(),
}));

import { buildOweMessage } from "../owe-message";
import { getDebtByUserId, getDebtByUsername } from "../debt";
import {
  getMemberByTelegramIdentity,
  getMemberByUsername,
  getConfig,
} from "../youtube-subscription";

const mockGetDebtByUserId = vi.mocked(getDebtByUserId);
const mockGetDebtByUsername = vi.mocked(getDebtByUsername);
const mockGetMemberByTelegramIdentity = vi.mocked(getMemberByTelegramIdentity);
const mockGetMemberByUsername = vi.mocked(getMemberByUsername);
const mockGetConfig = vi.mocked(getConfig);

// ── shared fixtures ───────────────────────────────────────────────────────────

const NO_DEBT = null;
const NO_MEMBER = null;
const MONTHLY_FEE = "5.00";

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
  mockGetConfig.mockResolvedValue(MONTHLY_FEE);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("buildOweMessage", () => {
  it("returns null when no debt record and no subscription member", async () => {
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toBeNull();
  });

  it("includes debt amount when user owes money", async () => {
    mockGetDebtByUserId.mockResolvedValue(debtRecord());
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toContain("$25.00");
    expect(result).toContain("Lunch");
  });

  it("includes YouTube unpaid info", async () => {
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetMemberByTelegramIdentity.mockResolvedValue(ytMember(3));

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toContain("3 month(s)");
    expect(result).toContain("$5.00");
  });

  it("shows net total correctly when both debt and YouTube owed", async () => {
    mockGetDebtByUserId.mockResolvedValue(
      debtRecord({ owes_me: 10, i_owe: 0 }),
    );
    mockGetMemberByTelegramIdentity.mockResolvedValue(ytMember(2)); // 2 × $5 = $10

    const result = await buildOweMessage(123, "user", "User");
    // net = 10 + 10 = 20
    expect(result).toContain("$20.00");
  });

  it("shows 'Vannyou owes you' message when i_owe > 0", async () => {
    mockGetDebtByUserId.mockResolvedValue(
      debtRecord({ owes_me: 0, i_owe: 15, items: [] }),
    );
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "user", "User");
    expect(result).toContain("$15.00");
    // one of the NET_I_OWE messages
    expect(result?.toLowerCase()).toMatch(/vannyou owes you|owes you/);
  });

  it("shows all-settled message when net is zero", async () => {
    mockGetDebtByUserId.mockResolvedValue(
      debtRecord({ owes_me: 0, i_owe: 0, items: [] }),
    );
    mockGetMemberByTelegramIdentity.mockResolvedValue(ytMember(0));

    const result = await buildOweMessage(123, "user", "User");
    // one of the ALL_SETTLED messages — all contain zero-balance language
    expect(result).not.toBeNull();
    expect(result).toMatch(/clean|settled|zero|nothing/i);
  });

  it("falls back to getDebtByUsername when userId is 0", async () => {
    mockGetDebtByUsername.mockResolvedValue(debtRecord());
    mockGetMemberByUsername.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(0, "user", "User");
    expect(mockGetDebtByUsername).toHaveBeenCalledWith("user");
    expect(result).toContain("$25.00");
  });

  it("returns null when both lookups return null and no member", async () => {
    mockGetDebtByUserId.mockResolvedValue(NO_DEBT);
    mockGetDebtByUsername.mockResolvedValue(NO_DEBT);
    mockGetMemberByTelegramIdentity.mockResolvedValue(NO_MEMBER);

    const result = await buildOweMessage(123, "", "Friend");
    expect(result).toBeNull();
  });
});
