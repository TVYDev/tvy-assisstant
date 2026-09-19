import { describe, expect, it } from "vitest";
import {
  OWNER_HELP_TEXT,
  PUBLIC_HELP_TEXT,
  TELEGRAM_MESSAGE_CHAR_LIMIT,
  splitTelegramText,
} from "../owner-menu";

describe("splitTelegramText", () => {
  it("leaves short text alone", () => {
    expect(splitTelegramText("hello")).toEqual(["hello"]);
  });

  it("splits on section breaks before the Telegram limit", () => {
    const first = "A".repeat(20);
    const second = "B".repeat(20);
    const chunks = splitTelegramText(`${first}\n\n${second}`, 30);
    expect(chunks).toEqual([first, second]);
    expect(chunks.every((chunk) => chunk.length <= 30)).toBe(true);
  });
});

describe("help text", () => {
  it("keeps public help under the Telegram limit", () => {
    expect(PUBLIC_HELP_TEXT.length).toBeLessThanOrEqual(
      TELEGRAM_MESSAGE_CHAR_LIMIT,
    );
  });

  it("sends owner help in chunks Telegram will accept", () => {
    const chunks = splitTelegramText(OWNER_HELP_TEXT);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toContain("Todos & reminders");
    expect(
      chunks.every((chunk) => chunk.length <= TELEGRAM_MESSAGE_CHAR_LIMIT),
    ).toBe(true);
  });
});
