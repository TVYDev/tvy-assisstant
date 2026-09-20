import { NextResponse } from "next/server";
import { jsonError, ownerSessionFromRequest } from "@/lib/mini-app/http";
import { getMorePayload } from "@/lib/mini-app/queries";
import { getOweSnapshotForShortcode } from "@/lib/owe-message";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ownerSessionFromRequest(request);
    const url = new URL(request.url);
    const preview = url.searchParams.get("preview")?.trim();
    if (preview) {
      return NextResponse.json({
        snapshot: await getOweSnapshotForShortcode(preview),
      });
    }
    return NextResponse.json(await getMorePayload());
  } catch (error) {
    return jsonError(error);
  }
}
