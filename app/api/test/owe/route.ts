import { NextRequest, NextResponse } from "next/server";
import { buildOweMessage } from "@/lib/owe-message";
import { supabase } from "@/lib/supabase";

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
    const { data } = await supabase
      .from("telegram_users")
      .select("telegram_user_id")
      .ilike("telegram_username", normalized)
      .maybeSingle();
    if (data?.telegram_user_id) {
      userId = data.telegram_user_id;
    }
  }

  const message = await buildOweMessage(userId, username, username);
  return NextResponse.json({
    message: message ?? "No records found for your username.",
  });
}
