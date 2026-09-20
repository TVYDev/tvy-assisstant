"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { DockNav } from "./dock-nav";
import { useMiniApp } from "./provider";

export function MiniAppShell({ children }: { children: ReactNode }) {
  const { status, error, session, webApp } = useMiniApp();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!webApp) return;
    const onBack = () => router.back();
    if (pathname !== "/") {
      webApp.BackButton.show();
      webApp.BackButton.onClick(onBack);
    } else {
      webApp.BackButton.hide();
    }
    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  }, [pathname, router, webApp]);

  if (status === "booting") {
    return (
      <main className="mini-app-shell mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <span className="loading loading-dots loading-lg text-primary" />
          <p className="text-sm opacity-70">Waking Dino…</p>
        </div>
      </main>
    );
  }

  if (status === "needs-telegram") {
    return (
      <main className="mini-app-shell mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
        <div className="card bg-base-200">
          <div className="card-body">
            <h1 className="card-title">Open in Telegram</h1>
            <p>
              This Mini App only works inside Telegram. Open Dino from the bot
              menu button.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="mini-app-shell mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
        <div className="alert alert-error">
          <span>{error ?? "Could not start Mini App."}</span>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-dvh w-full">
      <main className="mini-app-shell mx-auto w-full max-w-md">
        {session?.mock ? (
          <div className="alert alert-info mb-3 text-xs">
            Dev mock as {session.isOwner ? "owner" : "user"}. Add ?as=user to preview the public app.
          </div>
        ) : null}
        {children}
      </main>
      <DockNav />
    </div>
  );
}
