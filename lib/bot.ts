import fs from "fs";
import path from "path";
import { Bot, InputFile } from "grammy";
import { getDebtByUsername } from "./debt";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN environment variable is not set.");

export const bot = new Bot(token);

bot.command("start", (ctx) =>
  ctx.reply(
    "👋 Hi! I'm your personal debt tracker assistant.\n\n" +
      "Available commands:\n" +
      "/balance — see your balance with me\n" +
      "/pay — get my payment QR code",
  ),
);

bot.command("pay", (ctx) => {
  const qrPath = path.join(process.cwd(), "data", "qr.png");
  const file = new InputFile(fs.readFileSync(qrPath), "qr.png");
  return ctx.replyWithPhoto(file, { caption: "Scan to pay via KHQR." });
});

bot.command("balance", (ctx) => {
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
    lines.push(`💸 You owe me: $${record.owes_me.toFixed(2)}`);
    lines.push("  Items:");
    for (const item of record.items) {
      lines.push(
        `  • ${item.description} — $${item.amount.toFixed(2)} (${item.date})`,
      );
    }
  }

  if (record.i_owe > 0) {
    lines.push(`💰 I owe you: $${record.i_owe.toFixed(2)}`);
  }

  const net = record.owes_me - record.i_owe;
  lines.push("");
  if (net > 0) {
    lines.push(`📊 Net: you owe me $${net.toFixed(2)}`);
  } else if (net < 0) {
    lines.push(`📊 Net: I owe you $${Math.abs(net).toFixed(2)}`);
  } else {
    lines.push("📊 Net: all settled up!");
  }

  return ctx.reply(lines.join("\n"));
});
