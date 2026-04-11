This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Telegram Bot Setup

This project includes a Telegram bot powered by [grammY](https://grammy.dev/) that tracks debts and accepts payments via KHQR.

### 1. Get a Bot Token

1. Open Telegram and start a conversation with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the token you receive.

### 2. Configure Environment Variables

Edit `.env.local` (already created) and fill in your values:

```
BOT_TOKEN=your_bot_token_from_botfather
WEBHOOK_URL=https://your-vercel-deployment.vercel.app
```

Add both variables to your **Vercel project settings** under _Environment Variables_ as well.

### 3. Replace the QR Code Placeholder

Replace `data/qr.png` with your real KHQR image before deploying.

### 4. Deploy to Vercel

```bash
vercel deploy --prod
```

### 5. Register the Webhook

After deploying, register the webhook so Telegram knows where to send updates:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<VERCEL_URL>/api/telegram
```

Replace `<TOKEN>` with your bot token and `<VERCEL_URL>` with your Vercel deployment URL (e.g. `https://your-app.vercel.app`).

### Bot Commands

| Command    | Description                                                            |
| ---------- | ---------------------------------------------------------------------- |
| `/start`   | Welcome message and command list                                       |
| `/balance` | Shows your itemized debt balance (looked up by your Telegram username) |
| `/pay`     | Sends the KHQR payment QR code                                         |

### Updating Debt Records

Edit `data/debts.json` to add or update debt records. Each key is the Telegram username prefixed with `@`.
