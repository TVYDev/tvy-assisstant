import { NextResponse } from "next/server";
import { jsonError, ownerSessionFromRequest } from "@/lib/mini-app/http";
import { getTasksPayload } from "@/lib/mini-app/queries";
import { parseTodoListFilter, searchTodos } from "@/lib/todos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ownerSessionFromRequest(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (query) {
      return NextResponse.json({
        results: await searchTodos(query),
      });
    }
    const filter = parseTodoListFilter(
      url.searchParams.get("filter") ?? "today",
    );
    return NextResponse.json(await getTasksPayload(filter));
  } catch (error) {
    return jsonError(error);
  }
}
