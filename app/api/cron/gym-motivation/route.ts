import { NextRequest, NextResponse } from "next/server";
import { bot } from "@/lib/bot";
import {
  buildGymMotivationMessage,
  isGymMotivationReminderEnabled,
  isWeekdayInPhnomPenh,
} from "@/lib/fitness-log";

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

  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!ownerId) {
    return NextResponse.json(
      { error: "OWNER_TELEGRAM_ID is not set" },
      { status: 500 },
    );
  }

  if (!force && !isWeekdayInPhnomPenh()) {
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      skipped: true,
      reason: "weekend",
    });
  }

  const enabled = await isGymMotivationReminderEnabled();
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      skipped: true,
      reason: "disabled",
    });
  }

  const message = buildGymMotivationMessage();

  if (!dryRun) {
    await bot.api.sendMessage(ownerId, message);
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    skipped: false,
    chat_id: ownerId,
  });
}
