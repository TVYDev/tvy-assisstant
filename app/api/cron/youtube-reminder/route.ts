import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { InputFile } from "grammy";
import { bot } from "@/lib/bot";
import {
  getConfig,
  getMembers,
  incrementAllMonths,
  buildReminderMessage,
} from "@/lib/youtube-subscription";

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

  const monthlyFee = parseFloat(await getConfig("youtube_monthly_fee"));

  // dry_run: preview current state without incrementing
  const members = dryRun ? await getMembers() : await incrementAllMonths();

  // Send QR photo with the debt summary caption
  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");
  const caption = buildReminderMessage(members, monthlyFee);

  await bot.api.sendPhoto(groupChatId, file, { caption });

  return NextResponse.json({ ok: true, dry_run: dryRun, chat_id: groupChatId });
}
