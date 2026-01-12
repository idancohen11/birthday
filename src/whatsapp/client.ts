import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  WASocket,
  proto,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import pino from 'pino';

// Completely silent logger for Baileys
const silentLogger = pino({ level: 'silent' }) as any;
silentLogger.child = () => silentLogger;

let socket: WASocket | null = null;
let messageHandler: ((message: proto.IWebMessageInfo) => void) | null = null;

export function setMessageHandler(handler: (message: proto.IWebMessageInfo) => void) {
  messageHandler = handler;
}

export async function initializeWhatsApp(): Promise<WASocket> {
  console.log('🔄 Initializing WhatsApp...\n');
  
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    auth: state,
    version,
    logger: silentLogger,
    browser: ['Birthday Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async () => ({ conversation: '' }),
  });

  // Handle connection updates
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log('🔄 Reconnecting...');
        setTimeout(() => initializeWhatsApp(), 3000);
      } else {
        console.log('❌ Logged out. Delete session folder and restart.');
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connected and ready!\n');
    }
  });

  // Save credentials on update
  socket.ev.on('creds.update', saveCreds);

  // Handle messages - only from target group
  socket.ev.on('messages.upsert', async (upsert) => {
    for (const message of upsert.messages) {
      if (messageHandler) {
        messageHandler(message);
      }
    }
  });

  return socket;
}

export function getSocket(): WASocket | null {
  return socket;
}

export async function destroyWhatsApp(): Promise<void> {
  if (socket) {
    socket.end(undefined);
    socket = null;
    logger.info('WhatsApp client destroyed');
  }
}
