import { NextRequest, NextResponse } from "next/server";
import { bot } from "@/lib/bot";
import {
  buildMorningReminderMessage,
  getLogForDate,
  todayInPhnomPenh,
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

  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (!ownerId) {
    return NextResponse.json(
      { error: "OWNER_TELEGRAM_ID is not set" },
      { status: 500 },
    );
  }

  const logDate = todayInPhnomPenh();
  const existing = await getLogForDate(logDate);
  if (existing) {
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      skipped: true,
      reason: "already_logged",
      log_date: logDate,
    });
  }

  const message = buildMorningReminderMessage();

  if (!dryRun) {
    await bot.api.sendMessage(ownerId, message);
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    skipped: false,
    log_date: logDate,
    chat_id: ownerId,
  });
}
