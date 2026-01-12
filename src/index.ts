#!/usr/bin/env node
/**
 * Birthday Bot - WhatsApp bot that automatically sends birthday wishes
 * 
 * Usage:
 *   npm start          - Run the bot
 *   npm run dev        - Run in development mode with hot reload
 *   npm run test-prompt - Test prompts interactively
 */

// Suppress noisy Baileys/Signal encryption logs
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const shouldFilter = (...args: unknown[]): boolean => {
  // Check each argument individually
  for (const arg of args) {
    // Check if it's a SessionEntry object
    if (typeof arg === 'object' && arg !== null) {
      const obj = arg as Record<string, unknown>;
      if ('_chains' in obj || 'registrationId' in obj || 'currentRatchet' in obj || 
          'indexInfo' in obj || 'pendingPreKey' in obj || 'ephemeralKeyPair' in obj) {
        return true;
      }
    }
    
    // Check string content
    const str = String(arg);
    if (str.includes('Closing open session') ||
        str.includes('Closing session') ||
        str.includes('SessionEntry') ||
        str.includes('pendingPreKey') ||
        str.includes('signedKeyId') ||
        str.includes('preKeyId')) {
      return true;
    }
  }
  return false;
};

console.log = (...args: unknown[]) => {
  if (shouldFilter(...args)) return;
  originalLog.apply(console, args);
};

console.warn = (...args: unknown[]) => {
  if (shouldFilter(...args)) return;
  originalWarn.apply(console, args);
};

console.error = (...args: unknown[]) => {
  if (shouldFilter(...args)) return;
  originalError.apply(console, args);
};

import { config } from './config.js';
import { initializeWhatsApp, setMessageHandler, destroyWhatsApp } from './whatsapp/client.js';
import { handleMessage } from './whatsapp/handler.js';
import { logger } from './utils/logger.js';

async function main() {
  console.log('\n🎂 Birthday Bot Starting...\n');
  
  // Log configuration
  logger.info('Configuration loaded', {
    dryRun: config.dryRun,
    targetGroup: config.targetGroupId,
    delayRange: `${config.responseDelayMin / 1000}s - ${config.responseDelayMax / 1000}s`,
    confidenceThreshold: config.confidenceThreshold,
  });

  if (config.dryRun) {
    console.log('⚠️  DRY RUN MODE - No messages will actually be sent\n');
  }

  // Set up message handler
  setMessageHandler(handleMessage);

  // Initialize WhatsApp client
  logger.info('Initializing WhatsApp client...');
  console.log('🔄 Initializing WhatsApp client...\n');
  
  const socket = await initializeWhatsApp();

  logger.info('Monitoring group', { groupId: config.targetGroupId });
  console.log(`👀 Monitoring group: ${config.targetGroupId}\n`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    console.log(`\n⏳ Shutting down gracefully...`);
    
    try {
      await destroyWhatsApp();
      console.log('✅ Shutdown complete\n');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep the process alive
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error });
    shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
