"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MiniAppSession } from "@/lib/mini-app/auth";
import { miniGet } from "./api";
import type { SessionPayload } from "@/lib/mini-app/queries";

type MiniStatus = "booting" | "needs-telegram" | "ready" | "error";

type MiniAppContextValue = {
  status: MiniStatus;
  error: string | null;
  initData: string;
  session: SessionPayload | null;
  haptic: (type: "success" | "error" | "warning") => void;
  webApp: TelegramWebApp | null;
  reloadSession: () => Promise<void>;
};

const MiniAppContext = createContext<MiniAppContextValue | null>(null);

function readDevInitData(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("as") === "user" ? "dev:user" : "dev";
}

function applyTelegramTheme(webApp: TelegramWebApp) {
  const dark = webApp.colorScheme === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "night" : "light");
  const bg =
    webApp.themeParams.bg_color ?? (dark ? "#0a0a0a" : "#ffffff");
  const text =
    webApp.themeParams.text_color ?? (dark ? "#f3f4f6" : "#111827");
  document.documentElement.style.setProperty("--tg-bg", bg);
  document.documentElement.style.setProperty("--tg-text", text);
  const inset = webApp.contentSafeAreaInset ?? webApp.safeAreaInset;
  if (inset) {
    document.documentElement.style.setProperty("--tg-safe-top", `${inset.top}px`);
    document.documentElement.style.setProperty(
      "--tg-safe-bottom",
      `${inset.bottom}px`,
    );
    document.documentElement.style.setProperty("--tg-safe-left", `${inset.left}px`);
    document.documentElement.style.setProperty(
      "--tg-safe-right",
      `${inset.right}px`,
    );
  }
  webApp.setHeaderColor(bg);
  webApp.setBackgroundColor(bg);
  webApp.setBottomBarColor?.(bg);
}

export function MiniAppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MiniStatus>("booting");
  const [error, setError] = useState<string | null>(null);
  const [initData, setInitData] = useState("");
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);

  const loadSession = useCallback(async (data: string) => {
    const next = await miniGet<SessionPayload>("/api/mini/session", data);
    setSession(next);
  }, []);

  useEffect(() => {
    const boot = async () => {
      const telegram = window.Telegram?.WebApp ?? null;
      if (telegram) {
        telegram.ready();
        telegram.expand();
        applyTelegramTheme(telegram);
        setWebApp(telegram);
      }

      const fromTelegram = telegram?.initData?.trim() ?? "";
      const resolved = fromTelegram || readDevInitData() || "";
      if (!resolved) {
        setStatus("needs-telegram");
        return;
      }

      try {
        setInitData(resolved);
        await loadSession(resolved);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start Mini App");
        setStatus("error");
      }
    };

    void boot();
  }, [loadSession]);

  const haptic = useCallback(
    (type: "success" | "error" | "warning") => {
      webApp?.HapticFeedback.notificationOccurred(type);
    },
    [webApp],
  );

  const reloadSession = useCallback(async () => {
    if (!initData) return;
    await loadSession(initData);
  }, [initData, loadSession]);

  const value = useMemo<MiniAppContextValue>(
    () => ({
      status,
      error,
      initData,
      session,
      haptic,
      webApp,
      reloadSession,
    }),
    [status, error, initData, session, haptic, webApp, reloadSession],
  );

  return (
    <MiniAppContext.Provider value={value}>{children}</MiniAppContext.Provider>
  );
}

export function useMiniApp() {
  const context = useContext(MiniAppContext);
  if (!context) {
    throw new Error("useMiniApp must be used inside MiniAppProvider");
  }
  return context;
}

export function useMiniSession(): MiniAppSession & { version: string } {
  const { session } = useMiniApp();
  if (!session) {
    throw new Error("Mini App session is not ready");
  }
  return session;
}
