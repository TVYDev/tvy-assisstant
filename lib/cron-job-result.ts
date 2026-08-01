export interface CronJobResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  dryRun?: boolean;
  chatId?: string;
  logDate?: string;
  error?: string;
}

export function formatCronJobReply(
  jobName: string,
  result: CronJobResult,
): string {
  if (!result.ok) {
    return `❌ <b>${jobName}</b> failed: ${result.error ?? "Unknown error"}`;
  }

  if (result.skipped) {
    const reason =
      result.reason === "already_logged"
        ? "today is already logged — use force run or log via /fit"
        : result.reason === "weekend"
          ? "skipped on weekends (use menu run to force)"
          : result.reason === "disabled"
            ? "gym reminder is off — /gymreminder on"
            : (result.reason ?? "unknown");
    return `⏭ <b>${jobName}</b> skipped: ${reason}`;
  }

  const target = result.chatId
    ? `\nSent to chat <code>${result.chatId}</code>`
    : "";
  const date = result.logDate ? `\nLog date: ${result.logDate}` : "";
  return `✅ <b>${jobName}</b> ran successfully.${target}${date}`;
}
