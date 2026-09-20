import fs from "node:fs";
import path from "node:path";
import { jsonError, sessionFromRequest } from "@/lib/mini-app/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await sessionFromRequest(request);
    const qrPath = path.join(process.cwd(), "data", "qr.jpeg");
    const bytes = fs.readFileSync(qrPath);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
