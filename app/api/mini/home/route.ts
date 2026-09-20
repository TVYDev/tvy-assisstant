import { NextResponse } from "next/server";
import { jsonError, sessionFromRequest } from "@/lib/mini-app/http";
import { getHomePayload } from "@/lib/mini-app/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await sessionFromRequest(request);
    return NextResponse.json(await getHomePayload(session));
  } catch (error) {
    return jsonError(error);
  }
}
