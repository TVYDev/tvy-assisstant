export class MiniAppError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MiniAppError";
    this.status = status;
  }
}

export class MiniAppAuthError extends MiniAppError {
  constructor(message = "Open this Mini App from Telegram.") {
    super(message, 401);
    this.name = "MiniAppAuthError";
  }
}

export class MiniAppForbiddenError extends MiniAppError {
  constructor(message = "Boss only.") {
    super(message, 403);
    this.name = "MiniAppForbiddenError";
  }
}
