import { NextRequest, NextResponse } from "next/server";
import { runWordOfTheDayCron } from "@/lib/cron-jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";

  try {
    const result = await runWordOfTheDayCron({ dryRun });
    if (!result.ok) {
      console.error("Word of the day cron failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log("Word of the day cron finished", {
      dryRun,
      skipped: result.skipped ?? false,
      summary: result.summary,
    });

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      skipped: result.skipped ?? false,
      reason: result.reason,
      summary: result.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Word of the day cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
