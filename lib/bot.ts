import fs from "fs";
import path from "path";
import { Bot, InputFile } from "grammy";
import { upsertTelegramUser } from "./youtube-subscription";
import { buildOweMessage } from "./owe-message";

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

bot.command("owe", async (ctx) => {
  const username = ctx.from?.username;

  if (!username) {
    return ctx.reply(
      "Could not determine your Telegram username. Please make sure you have one set.",
    );
  }

  const userId = ctx.from!.id;

  // Keep telegram_users table up to date
  await upsertTelegramUser({
    telegram_user_id: userId,
    telegram_username: ctx.from!.username,
    first_name: ctx.from!.first_name,
    last_name: ctx.from!.last_name,
  });

  const message = await buildOweMessage(userId, username);
  if (!message) return ctx.reply("No records found for your username.");
  return ctx.reply(message);
});
