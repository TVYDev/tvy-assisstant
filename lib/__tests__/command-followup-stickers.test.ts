import { describe, expect, it, vi } from "vitest";

vi.mock("../youtube-subscription", () => ({
  getConfigOptional: vi.fn(),
  setConfig: vi.fn(),
}));

import {
  DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG,
  parseCommandFollowupStickerConfig,
  shouldSendCommandFollowupSticker,
} from "../command-followup-stickers";

describe("command-followup-stickers", () => {
  it("parseCommandFollowupStickerConfig falls back to defaults on invalid JSON", () => {
    const config = parseCommandFollowupStickerConfig("{not json");
    expect(config.start.enabled).toBe(true);
    expect(config.start.stickerId).toBe(
      DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG.start.stickerId,
    );
    expect(config.owe.minNetOwed).toBe(5);
  });

  it("shouldSendCommandFollowupSticker respects enablement and thresholds", () => {
    const rule = {
      enabled: true,
      stickerId: "CAAC-test",
      minNetOwed: 5,
    };

    expect(shouldSendCommandFollowupSticker(rule, 5)).toBe(false);
    expect(shouldSendCommandFollowupSticker(rule, 5.01)).toBe(true);
    expect(
      shouldSendCommandFollowupSticker(
        { ...rule, enabled: false },
        100,
      ),
    ).toBe(false);
    expect(
      shouldSendCommandFollowupSticker(
        { enabled: true, stickerId: null, minNetOwed: null },
        0,
      ),
    ).toBe(false);
    expect(
      shouldSendCommandFollowupSticker(
        { enabled: true, stickerId: "CAAC-test", minNetOwed: null },
        0,
      ),
    ).toBe(true);
  });
});
