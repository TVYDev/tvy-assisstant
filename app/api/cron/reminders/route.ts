import { NextRequest, NextResponse } from "next/server";
import { runReminderCron } from "@/lib/cron-jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const params = req.nextUrl.searchParams;
  const dryRun = params.get("dry_run") === "true";

  const result = await runReminderCron({ dryRun });
  if (!result.ok) {
    console.error("Reminder cron failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  console.log("Reminder cron finished", {
    dryRun,
    skipped: result.skipped ?? false,
    sentCount: result.sentCount ?? 0,
  });

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    skipped: result.skipped ?? false,
    reason: result.reason,
    sent_count: result.sentCount ?? 0,
  });
}
