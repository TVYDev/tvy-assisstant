import { NextResponse } from "next/server";
import { jsonError, ownerSessionFromRequest } from "@/lib/mini-app/http";
import { getPersonLedger } from "@/lib/mini-app/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  try {
    await ownerSessionFromRequest(request);
    const { shortcode } = await params;
    return NextResponse.json(await getPersonLedger(shortcode));
  } catch (error) {
    return jsonError(error);
  }
}
