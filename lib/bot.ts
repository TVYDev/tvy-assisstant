import fs from "fs";
import path from "path";
import { Bot, InputFile } from "grammy";
import { getDebtByUsername } from "./debt";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN environment variable is not set.");

export const bot = new Bot(token);

bot.command(
  [
    "start",
    "tvy",
    "hey_tvy",
    "hi_tvy",
    "hello_tvy",
    "dino",
    "hey_dino",
    "hi_dino",
    "hello_dino",
  ],
  async (ctx) => {
    await ctx.reply(
      "👋 Hi!\nI'm Dino (aka Nailong). I'm a personal assistant to my boss, VANNYOU.\nI'll assist anything I can for him.\n\n" +
        "Available commands:\n" +
        "/owe — see if Vannyou owes you or you owe Vannyou any money\n" +
        "/qr — get KHQR code to pay Vannyou if you owe him money",
    );
    return ctx.replyWithSticker(
      "CAACAgUAAxkBAAMHadp2j926kQ_JshGZsD4LxsQ-sKsAAnEFAAK9lPBWUYQTpHJGzMM7BA",
    );
  },
);

bot.command("qr", (ctx) => {
  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");
  return ctx.replyWithPhoto(file, {
    caption: "Scan to pay via KHQR to Vannyou.",
  });
});

bot.command("owe", (ctx) => {
  const username = ctx.from?.username;

  if (!username) {
    return ctx.reply(
      "Could not determine your Telegram username. Please make sure you have one set.",
    );
  }

  const record = getDebtByUsername(username);

  if (!record) {
    return ctx.reply("No records found for your username.");
  }

  const lines: string[] = [
    `Balance summary for ${record.name} (@${username})`,
    "",
  ];

  if (record.owes_me > 0) {
    lines.push(`💸 You owe Vannyou: $${record.owes_me.toFixed(2)}`);
    lines.push("  Items:");
    for (const item of record.items) {
      lines.push(
        `  • ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  }

  if (record.i_owe > 0) {
    lines.push(`💰 Vannyou owes you: $${record.i_owe.toFixed(2)}`);
  }

  const net = record.owes_me - record.i_owe;
  lines.push("");
  if (net > 0) {
    lines.push(`📊 Net: you owe Vannyou $${net.toFixed(2)}`);
  } else if (net < 0) {
    lines.push(`📊 Net: Vannyou owes you $${Math.abs(net).toFixed(2)}`);
  } else {
    lines.push("📊 Net: all settled up!");
  }

  return ctx.reply(lines.join("\n"));
});
