import { describe, it, expect } from "vitest";
import { formatCronJobReply } from "../cron-job-result";

describe("formatCronJobReply", () => {
  it("formats success", () => {
    const text = formatCronJobReply("YouTube reminder", {
      ok: true,
      chatId: "-100123",
    });
    expect(text).toContain("YouTube reminder");
    expect(text).toContain("-100123");
  });

  it("formats skipped already logged", () => {
    const text = formatCronJobReply("Fitness reminder", {
      ok: true,
      skipped: true,
      reason: "already_logged",
    });
    expect(text).toContain("skipped");
    expect(text).toContain("already logged");
  });

  it("formats errors", () => {
    const text = formatCronJobReply("Gym motivation", {
      ok: false,
      error: "OWNER_TELEGRAM_ID is not set",
    });
    expect(text).toContain("failed");
    expect(text).toContain("OWNER_TELEGRAM_ID");
  });

  it("formats no due reminders", () => {
    const text = formatCronJobReply("Due reminders", {
      ok: true,
      skipped: true,
      reason: "none_due",
    });
    expect(text).toContain("no reminders were due");
  });

  it("formats sent reminder count", () => {
    const text = formatCronJobReply("Due reminders", {
      ok: true,
      sentCount: 2,
    });
    expect(text).toContain("Sent 2 reminders");
  });
});
