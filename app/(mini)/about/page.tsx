"use client";

import { PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";

export default function AboutPage() {
  const { session } = useMiniApp();
  const version = session?.version ?? "…";

  return (
    <>
      <PageHeader title="About Dino" subtitle={`Version ${version}`} />
      <div className="card bg-base-200">
        <div className="card-body text-sm leading-6">
          <p>
            Meet Dino — aka Nailong. Round belly, silly face, sharp memory for unpaid
            tabs.
          </p>
          <p>
            In this Mini App you can check your balance, see itemized debts and YouTube
            months, and pay Vannyou with KHQR.
          </p>
          <ul className="list-disc pl-5">
            <li>Home — your current tab</li>
            <li>Pay — KHQR + amount due</li>
            <li>About — this page</li>
          </ul>
          <p className="opacity-70">Built by Vannyou. Powered by Next.js and daisyUI.</p>
        </div>
      </div>
    </>
  );
}
