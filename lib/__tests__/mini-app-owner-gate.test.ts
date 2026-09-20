import { describe, expect, it, vi } from "vitest";
import { MiniAppForbiddenError } from "../mini-app/errors";

vi.mock("../youtube-subscription", () => ({
  upsertTelegramUser: vi.fn().mockResolvedValue(undefined),
}));

describe("mini-app owner gate", () => {
  it("requireMiniOwner rejects a non-owner session", async () => {
    vi.stubEnv("OWNER_TELEGRAM_ID", "100");
    vi.stubEnv("NODE_ENV", "test");
    const { requireMiniOwner } = await import("../mini-app/auth");
    await expect(requireMiniOwner("dev:user")).rejects.toBeInstanceOf(
      MiniAppForbiddenError,
    );
    vi.unstubAllEnvs();
  });

  it("requireMiniOwner accepts the owner mock", async () => {
    vi.stubEnv("OWNER_TELEGRAM_ID", "100");
    vi.stubEnv("NODE_ENV", "test");
    const { requireMiniOwner } = await import("../mini-app/auth");
    const session = await requireMiniOwner("dev");
    expect(session.isOwner).toBe(true);
    expect(session.user.id).toBe(100);
    vi.unstubAllEnvs();
  });
});
