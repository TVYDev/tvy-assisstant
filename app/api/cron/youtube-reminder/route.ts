import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { InputFile } from "grammy";
import { bot } from "@/lib/bot";
import {
  insertCurrentMonthForAll,
  buildReminderMessage,
  REMINDER_PARSE_MODE,
} from "@/lib/youtube-subscription";
import { getAllDepositTotals } from "@/lib/deposit";
import {
  getYoutubeReminderOwings,
  resolveYoutubeFeeAnnouncement,
  markYoutubeFeeScheduleAnnounced,
} from "@/lib/youtube-fee";

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
  const chatIdOverride = params.get("chat_id");

  const groupChatId = chatIdOverride ?? process.env.YOUTUBE_GROUP_CHAT_ID;
  if (!groupChatId) {
    return NextResponse.json(
      { error: "YOUTUBE_GROUP_CHAT_ID is not set" },
      { status: 500 },
    );
  }

  // dry_run: preview current state without inserting new month
  if (!dryRun) await insertCurrentMonthForAll();
  const [owings, depositTotals, feeAnnouncement] = await Promise.all([
    getYoutubeReminderOwings(),
    getAllDepositTotals(),
    resolveYoutubeFeeAnnouncement(),
  ]);

  // Send QR photo with the debt summary caption
  const qrPath = path.join(process.cwd(), "data", "qr.jpeg");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.jpeg");
  const caption = buildReminderMessage(owings, depositTotals, {
    feeAnnouncement: feeAnnouncement.text ?? undefined,
  });

  await bot.api.sendPhoto(groupChatId, file, {
    caption,
    parse_mode: REMINDER_PARSE_MODE,
  });

  if (!dryRun && feeAnnouncement.scheduleIdToMark !== null) {
    await markYoutubeFeeScheduleAnnounced(feeAnnouncement.scheduleIdToMark);
  }

  return NextResponse.json({ ok: true, dry_run: dryRun, chat_id: groupChatId });
}
