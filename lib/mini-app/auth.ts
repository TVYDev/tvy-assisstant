import { createHmac, timingSafeEqual } from "node:crypto";
import { upsertTelegramUser } from "../youtube-subscription";
import {
  MiniAppAuthError,
  MiniAppForbiddenError,
} from "./errors";

export const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MiniAppUser = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
};

export type MiniAppSession = {
  user: MiniAppUser;
  isOwner: boolean;
  mock: boolean;
};

export type DevMiniAppRole = "owner" | "user";

function ownerTelegramId(): number {
  return parseInt(process.env.OWNER_TELEGRAM_ID ?? "0", 10) || 0;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function parseDevInitData(initData: string): DevMiniAppRole | null {
  const value = initData.trim();
  if (value === "dev" || value === "dev:owner") return "owner";
  if (value === "dev:user") return "user";
  return null;
}

export function parseAuthorizationInitData(
  header: string | null | undefined,
): string {
  const value = header?.trim() ?? "";
  if (!value.toLowerCase().startsWith("tma ")) {
    throw new MiniAppAuthError();
  }
  return value.slice(4).trim();
}

function hmacHex(key: Buffer | string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

function hashesMatch(expectedHex: string, actualHex: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    if (expected.length === 0 || expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function validateInitData(
  initData: string,
  botToken: string,
  nowMs = Date.now(),
  maxAgeMs = INIT_DATA_MAX_AGE_MS,
): MiniAppUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new MiniAppAuthError("Missing initData hash.");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = hmacHex(secretKey, dataCheckString);
  if (!hashesMatch(computed, hash)) {
    throw new MiniAppAuthError("Invalid initData.");
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? parseInt(authDateRaw, 10) : NaN;
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new MiniAppAuthError("Missing initData auth_date.");
  }
  if (nowMs - authDate * 1000 > maxAgeMs) {
    throw new MiniAppAuthError("initData expired.");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new MiniAppAuthError("Missing Telegram user.");
  }

  let parsed: {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  try {
    parsed = JSON.parse(userRaw) as typeof parsed;
  } catch {
    throw new MiniAppAuthError("Invalid Telegram user payload.");
  }

  const id = Number(parsed.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new MiniAppAuthError("Invalid Telegram user id.");
  }

  return {
    id,
    firstName: parsed.first_name?.trim() || "friend",
    lastName: parsed.last_name?.trim() ?? "",
    username: parsed.username?.trim() ?? "",
  };
}

function mockUser(role: DevMiniAppRole): MiniAppUser {
  if (role === "owner") {
    const id = ownerTelegramId() || 1;
    return {
      id,
      firstName: "Vannyou",
      lastName: "",
      username: "vannyou",
    };
  }
  return {
    id: 999_000_001,
    firstName: "Dev",
    lastName: "User",
    username: "devuser",
  };
}

export function resolveMiniAppUser(
  initData: string,
  options?: { botToken?: string; nowMs?: number },
): { user: MiniAppUser; mock: boolean } {
  const role = parseDevInitData(initData);
  if (role) {
    if (isProduction()) {
      throw new MiniAppAuthError();
    }
    return { user: mockUser(role), mock: true };
  }

  const token = options?.botToken ?? process.env.BOT_TOKEN ?? "";
  if (!token) {
    throw new MiniAppAuthError("Bot is not configured.");
  }

  return {
    user: validateInitData(initData, token, options?.nowMs),
    mock: false,
  };
}

export function isMiniAppOwner(userId: number): boolean {
  const ownerId = ownerTelegramId();
  return ownerId > 0 && userId === ownerId;
}

export async function requireMiniUser(
  initData: string,
): Promise<MiniAppSession> {
  if (!initData.trim()) {
    throw new MiniAppAuthError();
  }

  const { user, mock } = resolveMiniAppUser(initData);
  if (!mock) {
    await upsertTelegramUser({
      telegram_user_id: user.id,
      telegram_username: user.username || undefined,
      first_name: user.firstName,
      last_name: user.lastName || undefined,
    });
  }

  return {
    user,
    isOwner: mock
      ? parseDevInitData(initData) === "owner"
      : isMiniAppOwner(user.id),
    mock,
  };
}

export async function requireMiniOwner(
  initData: string,
): Promise<MiniAppSession> {
  const session = await requireMiniUser(initData);
  if (!session.isOwner) {
    throw new MiniAppForbiddenError();
  }
  return session;
}
