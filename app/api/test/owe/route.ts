import { NextRequest, NextResponse } from "next/server";
import { ilike } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { telegramUsers } from "@/lib/db/schema";
import { buildOweMessage } from "@/lib/owe-message";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const username = params.get("username") ?? "";
  let userId = parseInt(params.get("user_id") ?? "0");

  if (!username) {
    return NextResponse.json(
      { error: "username is required" },
      { status: 400 },
    );
  }

  // Resolve user_id from telegram_users if not provided
  if (!userId) {
    const normalized = username.startsWith("@") ? username.slice(1) : username;
    const data = await getDb().query.telegramUsers.findFirst({
      where: ilike(telegramUsers.telegramUsername, normalized),
      columns: { telegramUserId: true },
    });
    if (data?.telegramUserId) {
      userId = data.telegramUserId;
    }
  }

  const message = await buildOweMessage(userId, username, username);
  return NextResponse.json({
    message: message ?? "No records found for your username.",
  });
}
