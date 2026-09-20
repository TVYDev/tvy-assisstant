import { NextResponse } from "next/server";
import {
  MiniAppAuthError,
  MiniAppError,
  MiniAppForbiddenError,
} from "./errors";
import {
  parseAuthorizationInitData,
  requireMiniOwner,
  requireMiniUser,
  type MiniAppSession,
} from "./auth";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof MiniAppError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 400 });
}

export function readInitData(request: Request): string {
  try {
    return parseAuthorizationInitData(request.headers.get("authorization"));
  } catch (error) {
    if (error instanceof MiniAppAuthError) throw error;
    throw new MiniAppAuthError();
  }
}

export async function sessionFromRequest(
  request: Request,
): Promise<MiniAppSession> {
  return requireMiniUser(readInitData(request));
}

export async function ownerSessionFromRequest(
  request: Request,
): Promise<MiniAppSession> {
  return requireMiniOwner(readInitData(request));
}

export function actionErrorMessage(error: unknown): string {
  if (
    error instanceof MiniAppAuthError ||
    error instanceof MiniAppForbiddenError ||
    error instanceof MiniAppError
  ) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Unexpected error";
}
