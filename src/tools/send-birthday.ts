/**
 * Manual birthday message sender
 * Usage: npx tsx src/tools/send-birthday.ts "צופית"
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { config } from '../config.js';
import { generateBirthdayMessage, replaceNamePlaceholder } from '../ai/generator.js';

const name = process.argv[2];

if (!name) {
  console.error('Usage: npx tsx src/tools/send-birthday.ts "Name"');
  console.error('Example: npx tsx src/tools/send-birthday.ts "צופית"');
  process.exit(1);
}

async function main() {
  console.log(`\n🎂 Sending birthday message for: ${name}`);
  console.log(`📍 Target group: ${config.targetGroupId}\n`);

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const socket = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Birthday Bot', 'Chrome', '120.0.0'],
    markOnlineOnConnect: false,
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.error('❌ Session logged out. Please re-scan QR code by running the main bot.');
        process.exit(1);
      }
      console.error('❌ Connection closed:', lastDisconnect?.error?.message);
      process.exit(1);
    }

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp\n');

      try {
        // Generate the birthday message
        console.log('🤖 Generating birthday message...');
        const generated = await generateBirthdayMessage(
          name,
          config.openaiApiKey,
          config.generationModel
        );

        const messageToSend = replaceNamePlaceholder(generated.message, name);
        console.log(`\n📝 Generated message:\n${messageToSend}\n`);

        // Ask for confirmation
        console.log('Sending in 3 seconds... (Ctrl+C to cancel)');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Send the message
        await socket.sendMessage(config.targetGroupId, { text: messageToSend });
        console.log('✅ Message sent successfully!\n');

        // Clean exit
        setTimeout(() => process.exit(0), 1000);
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      }
    }
  });
}

main();
