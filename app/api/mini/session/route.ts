import { NextResponse } from "next/server";
import { jsonError, sessionFromRequest } from "@/lib/mini-app/http";
import { sessionPayload } from "@/lib/mini-app/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await sessionFromRequest(request);
    return NextResponse.json(sessionPayload(session));
  } catch (error) {
    return jsonError(error);
  }
}
