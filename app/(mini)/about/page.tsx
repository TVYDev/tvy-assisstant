"use client";

import Link from "next/link";
import { PageHeader } from "@/components/mini/ui";
import { useMiniApp } from "@/components/mini/provider";

export default function AboutPage() {
  const { session } = useMiniApp();
  const version = session?.version ?? "…";
  const isOwner = session?.isOwner ?? false;

  return (
    <>
      <PageHeader title="About Dino" subtitle={`Version ${version}`} />
      <div className="card bg-base-200">
        <div className="card-body gap-3 text-sm leading-6">
          <p>
            Meet Dino — aka Nailong. Round belly, silly face, sharp memory for unpaid
            tabs.
          </p>
          {isOwner ? (
            <>
              <p>This Mini App is the same Dino as the bot, for faster glances and taps.</p>
              <ul className="list-disc pl-5">
                <li>
                  <Link href="/" className="link">Home</Link> — today&apos;s to-dos, owed, fitness
                </li>
                <li>
                  <Link href="/people" className="link">People</Link> — ledgers and settle
                </li>
                <li>
                  <Link href="/fitness" className="link">Fit</Link> — weight and gym log
                </li>
                <li>
                  <Link href="/tasks" className="link">Tasks</Link> — tick, swipe, remind
                </li>
                <li>
                  <Link href="/more" className="link">More</Link> — fees, stickers, crons
                </li>
              </ul>
            </>
          ) : (
            <>
              <p>
                Check your balance, see itemized debts and YouTube months, and pay
                Vannyou with KHQR.
              </p>
              <ul className="list-disc pl-5">
                <li>
                  <Link href="/" className="link">Home</Link> — your current tab
                </li>
                <li>
                  <Link href="/pay" className="link">Pay</Link> — KHQR + amount due
                </li>
                <li>About — this page</li>
              </ul>
            </>
          )}
          <p className="opacity-70">Built by Vannyou. Powered by Next.js and daisyUI.</p>
        </div>
      </div>
    </>
  );
}
