import { InlineKeyboard } from "grammy";
import { getConfigOptional, setConfig } from "./youtube-subscription";

export const COMMAND_FOLLOWUP_STICKERS_CONFIG_KEY =
  "command_followup_stickers";
export const COMMAND_STICKER_SETUP_PENDING_KEY =
  "command_sticker_setup_pending";

export const CONFIGURABLE_COMMANDS = ["start", "owe", "qr", "about"] as const;
export type ConfigurableCommandKey = (typeof CONFIGURABLE_COMMANDS)[number];

export type CommandFollowupStickerRule = {
  enabled: boolean;
  stickerId: string | null;
  minNetOwed: number | null;
};

export type CommandFollowupStickerConfig = Record<
  ConfigurableCommandKey,
  CommandFollowupStickerRule
>;

const DEFAULT_START_STICKER_ID =
  "CAACAgUAAxkBAAMHadp2j926kQ_JshGZsD4LxsQ-sKsAAnEFAAK9lPBWUYQTpHJGzMM7BA";

const DEFAULT_RULE: CommandFollowupStickerRule = {
  enabled: false,
  stickerId: null,
  minNetOwed: null,
};

export const DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG: CommandFollowupStickerConfig =
  {
    start: {
      enabled: true,
      stickerId: DEFAULT_START_STICKER_ID,
      minNetOwed: null,
    },
    owe: { ...DEFAULT_RULE, minNetOwed: 5 },
    qr: { ...DEFAULT_RULE, minNetOwed: 5 },
    about: { ...DEFAULT_RULE },
  };

const COMMAND_LABELS: Record<ConfigurableCommandKey, string> = {
  start: "Start / Dino",
  owe: "/owe",
  qr: "/qr",
  about: "/about",
};

function isConfigurableCommandKey(value: string): value is ConfigurableCommandKey {
  return (CONFIGURABLE_COMMANDS as readonly string[]).includes(value);
}

function normalizeRule(
  rule: Partial<CommandFollowupStickerRule> | undefined,
  fallback: CommandFollowupStickerRule,
): CommandFollowupStickerRule {
  return {
    enabled: rule?.enabled ?? fallback.enabled,
    stickerId:
      typeof rule?.stickerId === "string" && rule.stickerId.trim()
        ? rule.stickerId.trim()
        : rule?.stickerId === null
          ? null
          : fallback.stickerId,
    minNetOwed:
      typeof rule?.minNetOwed === "number" && rule.minNetOwed >= 0
        ? rule.minNetOwed
        : rule?.minNetOwed === null
          ? null
          : fallback.minNetOwed,
  };
}

export function parseCommandFollowupStickerConfig(
  raw: string | null | undefined,
): CommandFollowupStickerConfig {
  if (!raw?.trim()) return structuredClone(DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG);

  try {
    const parsed = JSON.parse(raw) as Partial<
      Record<ConfigurableCommandKey, Partial<CommandFollowupStickerRule>>
    >;
    return {
      start: normalizeRule(parsed.start, DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG.start),
      owe: normalizeRule(parsed.owe, DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG.owe),
      qr: normalizeRule(parsed.qr, DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG.qr),
      about: normalizeRule(parsed.about, DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG.about),
    };
  } catch {
    return structuredClone(DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG);
  }
}

export async function getCommandFollowupStickerConfig(): Promise<CommandFollowupStickerConfig> {
  const raw = await getConfigOptional(COMMAND_FOLLOWUP_STICKERS_CONFIG_KEY);
  return parseCommandFollowupStickerConfig(raw);
}

export async function saveCommandFollowupStickerConfig(
  config: CommandFollowupStickerConfig,
): Promise<void> {
  await setConfig(
    COMMAND_FOLLOWUP_STICKERS_CONFIG_KEY,
    JSON.stringify(config),
  );
}

export async function updateCommandFollowupStickerRule(
  command: ConfigurableCommandKey,
  patch: Partial<CommandFollowupStickerRule>,
): Promise<CommandFollowupStickerRule> {
  const config = await getCommandFollowupStickerConfig();
  config[command] = normalizeRule(
    { ...config[command], ...patch },
    DEFAULT_COMMAND_FOLLOWUP_STICKER_CONFIG[command],
  );
  await saveCommandFollowupStickerConfig(config);
  return config[command];
}

export async function getStickerSetupPending(): Promise<ConfigurableCommandKey | null> {
  const raw = await getConfigOptional(COMMAND_STICKER_SETUP_PENDING_KEY);
  const value = raw?.trim() ?? "";
  return isConfigurableCommandKey(value) ? value : null;
}

export async function setStickerSetupPending(
  command: ConfigurableCommandKey,
): Promise<void> {
  await setConfig(COMMAND_STICKER_SETUP_PENDING_KEY, command);
}

export async function clearStickerSetupPending(): Promise<void> {
  await setConfig(COMMAND_STICKER_SETUP_PENDING_KEY, "");
}

export function shouldSendCommandFollowupSticker(
  rule: CommandFollowupStickerRule,
  netOwed?: number,
): boolean {
  if (!rule.enabled || !rule.stickerId) return false;
  if (rule.minNetOwed != null) {
    return (netOwed ?? 0) > rule.minNetOwed;
  }
  return true;
}

export async function maybeSendCommandFollowupSticker(
  ctx: { replyWithSticker: (fileId: string) => Promise<unknown> },
  command: ConfigurableCommandKey,
  options?: { netOwed?: number },
): Promise<boolean> {
  const config = await getCommandFollowupStickerConfig();
  const rule = config[command];
  if (!shouldSendCommandFollowupSticker(rule, options?.netOwed)) return false;

  await ctx.replyWithSticker(rule.stickerId!);
  return true;
}

function formatThreshold(rule: CommandFollowupStickerRule): string {
  if (rule.minNetOwed == null) return "Always (when enabled + sticker set)";
  return `Only when net owed &gt; $${rule.minNetOwed.toFixed(2)}`;
}

function formatRuleLine(command: ConfigurableCommandKey, rule: CommandFollowupStickerRule): string {
  const status = rule.enabled ? "ON" : "OFF";
  const sticker = rule.stickerId ? "set" : "not set";
  const threshold =
    command === "owe" || command === "qr"
      ? ` · ${formatThreshold(rule).replace(/&gt;/g, ">")}`
      : "";
  return `<code>/${command === "start" ? "start" : command}</code> — ${status} · sticker ${sticker}${threshold}`;
}

export function buildCommandStickersOverviewText(
  config: CommandFollowupStickerConfig,
): string {
  const lines = CONFIGURABLE_COMMANDS.map((command) =>
    formatRuleLine(command, config[command]),
  );
  return (
    "🎭 <b>Follow-up stickers</b>\n\n" +
    "After a command reply, Dino can send a sticker.\n" +
    "Pick a command below to toggle it, set a sticker, or choose a debt threshold.\n\n" +
    lines.join("\n") +
    "\n\nTo set a sticker: tap <b>Set sticker</b>, then send the sticker in our private chat."
  );
}

export function buildCommandStickerDetailText(
  command: ConfigurableCommandKey,
  rule: CommandFollowupStickerRule,
  pending: boolean,
): string {
  const stickerPreview = rule.stickerId
    ? `<code>${rule.stickerId.slice(0, 24)}…</code>`
    : "not set";

  return (
    `🎭 <b>${COMMAND_LABELS[command]}</b> follow-up sticker\n\n` +
    `Status: <b>${rule.enabled ? "ON" : "OFF"}</b>\n` +
    `Sticker: ${stickerPreview}\n` +
    (command === "owe" || command === "qr"
      ? `Threshold: ${formatThreshold(rule)}\n`
      : "") +
    (pending
      ? "\n⏳ Waiting for a sticker in our private chat..."
      : "\nTap <b>Set sticker</b>, then send the sticker in our private chat.")
  );
}

export function ownerStickersMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👋 Start", "om:sticker:start")
    .text("💸 Owe", "om:sticker:owe")
    .row()
    .text("🔲 QR", "om:sticker:qr")
    .text("ℹ️ About", "om:sticker:about")
    .row()
    .text("« Main menu", "om:main");
}

export function parseConfigurableCommandKey(
  value: string,
): ConfigurableCommandKey | null {
  return isConfigurableCommandKey(value) ? value : null;
}

export async function assignStickerToCommand(
  command: ConfigurableCommandKey,
  stickerId: string,
): Promise<CommandFollowupStickerRule> {
  return updateCommandFollowupStickerRule(command, {
    stickerId,
    enabled: true,
  });
}

export function ownerStickerCommandKeyboard(
  command: ConfigurableCommandKey,
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("Toggle ON/OFF", `om:sticker:${command}:toggle`)
    .text("Set sticker", `om:sticker:${command}:set`)
    .row()
    .text("Clear sticker", `om:sticker:${command}:clear`);

  if (command === "owe" || command === "qr") {
    keyboard
      .row()
      .text("Always", `om:sticker:${command}:min:none`)
      .text("> $0", `om:sticker:${command}:min:0`)
      .row()
      .text("> $5", `om:sticker:${command}:min:5`)
      .text("> $10", `om:sticker:${command}:min:10`)
      .row()
      .text("> $20", `om:sticker:${command}:min:20`);
  }

  return keyboard.row().text("« Back", "om:stickers");
}
