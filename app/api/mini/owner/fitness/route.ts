import { NextResponse } from "next/server";
import { jsonError, ownerSessionFromRequest } from "@/lib/mini-app/http";
import { getFitnessPayload } from "@/lib/mini-app/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ownerSessionFromRequest(request);
    return NextResponse.json(await getFitnessPayload());
  } catch (error) {
    return jsonError(error);
  }
}
