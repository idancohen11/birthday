# 🎂 Birthday Bot

A WhatsApp bot that automatically detects birthday wishes in group chats and sends personalized birthday messages on your behalf.

## Features

- 🔍 **Smart Detection**: Uses OpenAI to distinguish between initial birthday wishes and follow-up messages
- 🎁 **Personalized Messages**: Generates natural, varied birthday wishes
- 🕐 **Natural Timing**: Adds random delays to seem more human
- 🔒 **Deduplication**: Never sends duplicate wishes for the same birthday
- 🧪 **Easy Testing**: Interactive CLI for prompt testing without touching WhatsApp

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
DRY_RUN=true
```

### 3. Test the Prompts

Before connecting to WhatsApp, test that the AI classification works correctly:

```bash
npm run test-prompt
```

This opens an interactive CLI where you can:
- Type any message to test classification
- Type `generate <name>` to see generated birthday wishes
- Type `batch` to run all test fixtures
- Type `exit` to quit

### 4. Find Your Group ID

Run the bot without `TARGET_GROUP_ID` set:

```bash
npm run dev
```

1. Scan the QR code with WhatsApp
2. The bot will list all groups you're in
3. Copy the group ID for your target group
4. Add it to `.env`: `TARGET_GROUP_ID=xxxxx@g.us`

### 5. Run in Dry Run Mode

Keep `DRY_RUN=true` and run the bot. It will:
- Monitor the target group
- Detect birthday messages
- Log what it *would* send (without actually sending)

```bash
npm run dev
```

### 6. Go Live

When you're confident it works:

```bash
# In .env
DRY_RUN=false
```

## Project Structure

```
birthday-bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Environment configuration
│   ├── ai/
│   │   ├── classifier.ts     # Birthday message detection
│   │   ├── generator.ts      # Message generation
│   │   └── prompts.ts        # OpenAI prompts
│   ├── whatsapp/
│   │   ├── client.ts         # WhatsApp Web client
│   │   └── handler.ts        # Message handling logic
│   ├── db/
│   │   └── database.ts       # SQLite for deduplication
│   ├── utils/
│   │   ├── delay.ts          # Timing utilities
│   │   └── logger.ts         # Winston logger
│   └── tools/
│       ├── test-prompt.ts    # Interactive prompt tester
│       └── test-fixtures.ts  # Sample messages
├── render.yaml               # Render deployment config
├── Dockerfile                # Docker deployment option
└── env.example               # Environment template
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | Required |
| `TARGET_GROUP_ID` | WhatsApp group ID to monitor | None (logs all groups) |
| `DRY_RUN` | If `true`, only logs without sending | `true` |
| `RESPONSE_DELAY_MIN` | Minimum delay before responding (ms) | `30000` |
| `RESPONSE_DELAY_MAX` | Maximum delay before responding (ms) | `180000` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

## Deployment on Render

### Option 1: Blueprint (Recommended)

1. Push this repo to GitHub
2. In Render, create a new "Blueprint" and connect your repo
3. Render will use `render.yaml` to configure everything
4. Set `OPENAI_API_KEY` in the Render dashboard

### Option 2: Manual Setup

1. Create a new "Background Worker" on Render
2. Connect your GitHub repo
3. Set:
   - Build Command: `apt-get update && apt-get install -y chromium && npm ci && npm run build`
   - Start Command: `npm start`
4. Add a 1GB persistent disk mounted at `/opt/render/project/src/session`
5. Add environment variables

### First Run on Render

1. Check logs for the QR code
2. Scan it with WhatsApp (you have ~60 seconds)
3. Once authenticated, the session is saved to the persistent disk
4. Future deploys won't require re-authentication

## Testing Strategy

### Level 1: Prompt Testing (No WhatsApp)

```bash
npm run test-prompt
```

Test various messages to ensure correct classification before connecting to WhatsApp.

### Level 2: Dry Run Mode

```env
DRY_RUN=true
```

Bot connects to WhatsApp and processes messages, but only logs what it would send.

### Level 3: Test Group

Create a WhatsApp group with just yourself or trusted friends. Set `TARGET_GROUP_ID` to this test group.

### Level 4: Production

Only after all testing passes, set your real work group ID and `DRY_RUN=false`.

## How It Works

1. **Message Received** → Bot receives a message from the target group
2. **Pre-Filter** → Quick keyword check (contains "birthday", "יום הולדת", etc.)
3. **Classification** → OpenAI determines if it's an initial birthday wish
4. **Deduplication** → Check if we've already wished this person today
5. **Generation** → Create a personalized birthday message
6. **Delay** → Wait 30s-3min to seem natural
7. **Send** → Post the message to the group

## Safety Features

- **Dry Run Mode**: Default to not sending messages
- **Deduplication**: SQLite tracks all responses by person+date
- **Confidence Threshold**: Ignores low-confidence detections
- **Rate Limiting**: Random delays prevent spam
- **Graceful Shutdown**: Clean disconnect on SIGTERM

## Troubleshooting

### QR Code Expired

Delete the `session/` folder and restart the bot.

### Bot Not Detecting Messages

1. Check `TARGET_GROUP_ID` is correct
2. Ensure the message contains birthday keywords
3. Check logs for classification results

### Puppeteer Issues on Render

Ensure `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set.

## ⚠️ Disclaimer

This bot uses an unofficial WhatsApp Web library. While risk is low for personal use:
- Don't spam or abuse
- Don't use for commercial purposes
- Have a backup WhatsApp account just in case

## License

MIT

