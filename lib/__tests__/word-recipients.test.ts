import { describe, expect, it } from "vitest";
import {
  lessonChatIds,
  parseGroupChatId,
  parseWordRecipients,
  parseWordSendToOwner,
} from "../word-recipients";

describe("word recipients", () => {
  it("sends only to the owner when nothing else is configured", () => {
    expect(lessonChatIds("42", parseWordRecipients(null))).toEqual(["42"]);
  });

  it("adds saved users and group chats without duplicating the owner", () => {
    const recipients = parseWordRecipients(
      JSON.stringify({ userIds: [7, 7, 42], groupIds: ["-1001234567890", "42"] }),
    );
    expect(lessonChatIds("42", recipients)).toEqual(["42", "7", "-1001234567890"]);
  });

  it("skips the owner when sending to yourself is off", () => {
    const recipients = parseWordRecipients(
      JSON.stringify({ userIds: [7], groupIds: ["-1001234567890"] }),
    );
    expect(lessonChatIds("42", recipients, false)).toEqual(["7", "-1001234567890"]);
    expect(lessonChatIds("42", parseWordRecipients(null), false)).toEqual([]);
  });

  it("treats a missing send-to-owner setting as on", () => {
    expect(parseWordSendToOwner(null)).toBe(true);
    expect(parseWordSendToOwner("true")).toBe(true);
    expect(parseWordSendToOwner("false")).toBe(false);
  });

  it("rejects a short chat id", () => {
    expect(parseGroupChatId("12")).toBeNull();
    expect(parseGroupChatId("-1001234567890")).toBe("-1001234567890");
  });
});
