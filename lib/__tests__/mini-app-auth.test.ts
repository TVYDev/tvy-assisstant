import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  INIT_DATA_MAX_AGE_MS,
  parseAuthorizationInitData,
  parseDevInitData,
  resolveMiniAppUser,
  validateInitData,
} from "../mini-app/auth";
import { MiniAppAuthError } from "../mini-app/errors";

const BOT_TOKEN = "123456:TEST_TOKEN";

function makeInitData(
  user: { id: number; first_name: string; username?: string },
  authDate = Math.floor(Date.now() / 1000),
  token = BOT_TOKEN,
): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("mini-app auth", () => {
  it("parseAuthorizationInitData reads tma header", () => {
    expect(parseAuthorizationInitData("tma abc")).toBe("abc");
    expect(parseAuthorizationInitData("TMA abc")).toBe("abc");
    expect(() => parseAuthorizationInitData("Bearer x")).toThrow(MiniAppAuthError);
  });

  it("parseDevInitData only accepts mock tokens", () => {
    expect(parseDevInitData("dev")).toBe("owner");
    expect(parseDevInitData("dev:user")).toBe("user");
    expect(parseDevInitData("nope")).toBeNull();
  });

  it("validateInitData accepts a real HMAC payload", () => {
    const initData = makeInitData({
      id: 42,
      first_name: "Ada",
      username: "ada",
    });
    const user = validateInitData(initData, BOT_TOKEN);
    expect(user).toEqual({
      id: 42,
      firstName: "Ada",
      lastName: "",
      username: "ada",
    });
  });

  it("validateInitData rejects a bad hash", () => {
    const initData = makeInitData({ id: 1, first_name: "X" }).replace(
      /hash=[0-9a-f]+/,
      "hash=" + "ab".repeat(32),
    );
    expect(() => validateInitData(initData, BOT_TOKEN)).toThrow(MiniAppAuthError);
  });

  it("validateInitData rejects expired auth_date", () => {
    const authDate = Math.floor((Date.now() - INIT_DATA_MAX_AGE_MS - 1000) / 1000);
    const initData = makeInitData({ id: 1, first_name: "Old" }, authDate);
    expect(() => validateInitData(initData, BOT_TOKEN)).toThrow(/expired/);
  });

  it("resolveMiniAppUser rejects the dev mock in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => resolveMiniAppUser("dev")).toThrow(MiniAppAuthError);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
