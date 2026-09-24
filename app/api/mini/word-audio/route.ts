import { NextResponse } from "next/server";
import { getTodaysLessonWord } from "@/lib/daily-word";
import { jsonError, ownerSessionFromRequest } from "@/lib/mini-app/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ownerSessionFromRequest(request);
    const lesson = await getTodaysLessonWord();
    const audio = lesson?.pronounciationAudio;
    if (!audio || audio.length === 0) {
      return NextResponse.json({ error: "No pronunciation audio" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
