import { NextResponse } from "next/server";
import { jsonError, sessionFromRequest } from "@/lib/mini-app/http";
import { getOweSnapshot } from "@/lib/owe-message";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await sessionFromRequest(request);
    const snapshot = await getOweSnapshot(
      session.user.id,
      session.user.username,
      session.user.firstName,
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    return jsonError(error);
  }
}
