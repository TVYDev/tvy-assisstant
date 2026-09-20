"use client";

import { useRouter } from "next/navigation";
import { useMiniApp } from "./provider";

export function OwnerGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, status } = useMiniApp();

  if (status !== "ready") return null;
  if (!session?.isOwner) {
    router.replace("/");
    return (
      <div className="alert alert-warning">
        <span>Boss only. Head back home.</span>
      </div>
    );
  }
  return <>{children}</>;
}
