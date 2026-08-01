import { NextRequest, NextResponse } from "next/server";
import { runGymMotivationCron } from "@/lib/cron-jobs";

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
  const force = params.get("force") === "true";

  const result = await runGymMotivationCron({ dryRun, force });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    skipped: result.skipped ?? false,
    reason: result.reason,
    chat_id: result.chatId,
  });
}
