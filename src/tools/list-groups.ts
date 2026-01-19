#!/usr/bin/env node
/**
 * List all WhatsApp groups and their IDs
 */

import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';

async function main() {
  console.log('🔄 Connecting to WhatsApp...\n');
  
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const silentLogger = pino({ level: 'silent' }) as any;
  silentLogger.child = () => silentLogger;

  const socket = makeWASocket({
    auth: state,
    version,
    logger: silentLogger,
    browser: ['Birthday Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async (update) => {
    if (update.connection === 'open') {
      console.log('✅ Connected!\n');
      
      try {
        const groups = await socket.groupFetchAllParticipating();
        
        console.log('📋 Your WhatsApp Groups:\n');
        console.log('='.repeat(70));
        
        for (const [id, metadata] of Object.entries(groups)) {
          console.log(`Name: ${metadata.subject}`);
          console.log(`ID:   ${id}`);
          console.log('-'.repeat(70));
        }
        
        console.log(`\nTotal: ${Object.keys(groups).length} groups\n`);
      } catch (error) {
        console.error('Error fetching groups:', error);
      }
      
      socket.end(undefined);
      process.exit(0);
    }
  });
}

main().catch(console.error);



