export function getMiniAppUrl(): string | null {
  const raw = process.env.WEBHOOK_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}
