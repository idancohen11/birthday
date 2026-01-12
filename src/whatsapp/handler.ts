import { proto } from '@whiskeysockets/baileys';
import { getSocket } from './client.js';
import { config } from '../config.js';
import { classifyMessage, mightBeBirthdayMessage, generateBirthdayMessage } from '../ai/index.js';
import { randomDelay } from '../utils/delay.js';
import * as fs from 'fs';
import * as path from 'path';

// Number of recent messages to fetch for context (keep small to avoid false follow-up detection)
const CONTEXT_MESSAGE_COUNT = 10;

// Messages older than this (in minutes) are considered stale and won't affect context
// Set to 12 hours to cover full workday
const CONTEXT_EXPIRY_MINUTES = 720;

// Store recent messages per group for context
const recentMessagesCache = new Map<string, { text: string; timestamp: number }[]>();

// Track how many times we've wished each person TODAY (persisted to file)
const BIRTHDAY_WISHES_FILE = path.join(process.cwd(), 'data', 'today_wishes.json');
const MAX_WISHES_PER_PERSON = 2; // Allow wishing up to 2 times per person per day

interface TodayWishes {
  date: string; // YYYY-MM-DD
  wishes: Record<string, Record<string, number>>; // groupId -> { normalizedName -> count }
}

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function loadTodayWishes(): TodayWishes {
  try {
    if (fs.existsSync(BIRTHDAY_WISHES_FILE)) {
      const data = JSON.parse(fs.readFileSync(BIRTHDAY_WISHES_FILE, 'utf-8'));
      // Reset if it's a new day
      if (data.date !== getTodayString()) {
        console.log('📅 New day detected, resetting wish tracking');
        return { date: getTodayString(), wishes: {} };
      }
      return data;
    }
  } catch (e) {
    console.error('Error loading wishes file:', e);
  }
  return { date: getTodayString(), wishes: {} };
}

function saveTodayWishes(data: TodayWishes): void {
  try {
    const dir = path.dirname(BIRTHDAY_WISHES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BIRTHDAY_WISHES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving wishes file:', e);
  }
}

function normalizeName(name: string): string {
  // Normalize Hebrew/English names for comparison
  return name
    .toLowerCase()
    .trim()
    .replace(/^(ל|ה)/, '') // Remove Hebrew prefixes ל, ה
    .replace(/[!.,🎂🎉🎈🥳🎁]/g, ''); // Remove punctuation and emojis
}

function getWishCount(groupId: string, name: string): number {
  const data = loadTodayWishes();
  const normalizedName = normalizeName(name);
  return data.wishes[groupId]?.[normalizedName] || 0;
}

function canWishPerson(groupId: string, name: string): boolean {
  return getWishCount(groupId, name) < MAX_WISHES_PER_PERSON;
}

function recordWish(groupId: string, name: string): void {
  const data = loadTodayWishes();
  const normalizedName = normalizeName(name);
  
  if (!data.wishes[groupId]) {
    data.wishes[groupId] = {};
  }
  
  const currentCount = data.wishes[groupId][normalizedName] || 0;
  data.wishes[groupId][normalizedName] = currentCount + 1;
  
  console.log(`📝 Recorded wish #${currentCount + 1} for "${name}" (normalized: "${normalizedName}")`);
  saveTodayWishes(data);
}

// Keep track of detected birthday names (for context, not for limiting)
function recordBirthdayName(groupId: string, name: string): void {
  // This just logs for context, actual wish limiting is done by recordWish/canWishPerson
  const normalizedName = normalizeName(name);
  console.log(`📝 Detected birthday for "${name}" (normalized: "${normalizedName}")`);
}

function cleanExpiredMessages(groupId: string) {
  const messages = recentMessagesCache.get(groupId);
  if (!messages) return;
  
  const expiryTime = Date.now() - (CONTEXT_EXPIRY_MINUTES * 60 * 1000);
  const fresh = messages.filter(m => m.timestamp > expiryTime);
  recentMessagesCache.set(groupId, fresh);
}

function addToRecentMessages(groupId: string, text: string) {
  cleanExpiredMessages(groupId);
  
  if (!recentMessagesCache.has(groupId)) {
    recentMessagesCache.set(groupId, []);
  }
  const messages = recentMessagesCache.get(groupId)!;
  messages.push({ text, timestamp: Date.now() });
  
  // Keep only last N messages
  if (messages.length > CONTEXT_MESSAGE_COUNT) {
    messages.shift();
  }
}

function getRecentMessagesContext(groupId: string): string[] {
  cleanExpiredMessages(groupId);
  
  const messages = recentMessagesCache.get(groupId) || [];
  return messages.map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString('he-IL', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    return `[${time}] ${m.text}`;
  });
}

/**
 * Main message handler - processes incoming WhatsApp messages
 */
export async function handleMessage(message: proto.IWebMessageInfo): Promise<void> {
  console.log('\n🔍 HANDLER: Starting to process message...');
  
  try {
    const socket = getSocket();
    if (!socket) {
      console.log('❌ HANDLER: Socket not available');
      return;
    }

    const remoteJid = message.key.remoteJid;
    if (!remoteJid) {
      console.log('❌ HANDLER: No remoteJid');
      return;
    }

    // Only process messages from the target group (silent skip for others)
    if (remoteJid !== config.targetGroupId) return;

    const groupId = remoteJid;
    const isGroup = remoteJid.endsWith('@g.us');
    
    console.log(`🔍 HANDLER: isGroup=${isGroup}, remoteJid=${remoteJid}`);
    console.log(`🔍 HANDLER: config.targetGroupId="${config.targetGroupId}"`);
    
    // Get message text
    const messageBody = 
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      '';

    if (!messageBody) return;

    // Ignore messages from ourselves
    if (message.key.fromMe) return;

    console.log(`✅ HANDLER: Processing message from target group!`);
    console.log(`   Message: "${messageBody}"`);

    // Quick pre-filter to save API calls
    const mightBe = mightBeBirthdayMessage(messageBody);
    console.log(`🔍 HANDLER: mightBeBirthdayMessage=${mightBe}`);
    
    if (!mightBe) {
      addToRecentMessages(groupId, messageBody);
      return;
    }

    console.log('🎂 HANDLER: Birthday keywords detected! Calling OpenAI...');

    // Get recent messages for context (BEFORE adding current message!)
    const recentMessages = getRecentMessagesContext(groupId);
    console.log(`🔍 HANDLER: Context messages (${recentMessages.length}):`);
    if (recentMessages.length > 0) {
      recentMessages.forEach((msg, i) => console.log(`   ${i + 1}. ${msg}`));
    }
    console.log('==========================================');

    // Add current message to cache (for future context)
    addToRecentMessages(groupId, messageBody);

    // Classify the message using OpenAI (with context)
    const classification = await classifyMessage(
      messageBody,
      config.openaiApiKey,
      config.classificationModel,
      { recentMessages }
    );

    console.log('🔍 HANDLER: Classification result:', JSON.stringify(classification, null, 2));

    // Not a birthday message
    if (!classification.isBirthday) {
      console.log('🔍 HANDLER: Not a birthday message');
      return;
    }

    // Record the birthday name if detected (even for follow-ups)
    if (classification.birthdayPersonName) {
      recordBirthdayName(groupId, classification.birthdayPersonName);
    }

    // Not an initial wish (it's a follow-up)
    if (!classification.isInitialWish) {
      console.log('🔍 HANDLER: Birthday follow-up, not initial wish');
      return;
    }

    // Low confidence
    if (classification.confidence < config.confidenceThreshold) {
      console.log(`🔍 HANDLER: Low confidence (${classification.confidence} < ${config.confidenceThreshold})`);
      return;
    }

    // No name detected
    if (!classification.birthdayPersonName) {
      console.log('🔍 HANDLER: No name detected');
      return;
    }

    console.log(`🎉 HANDLER: Valid birthday wish detected for "${classification.birthdayPersonName}"!`);

    // Check if we can still wish this person (max 2 times per day)
    const wishCount = getWishCount(groupId, classification.birthdayPersonName);
    if (!canWishPerson(groupId, classification.birthdayPersonName)) {
      console.log(`🔍 HANDLER: Already wished ${classification.birthdayPersonName} ${wishCount} times today (max ${MAX_WISHES_PER_PERSON})`);
      return;
    }
    console.log(`🔍 HANDLER: Wish count for ${classification.birthdayPersonName}: ${wishCount}/${MAX_WISHES_PER_PERSON}`);

    // Generate a birthday message
    console.log('🔍 HANDLER: Generating birthday message...');
    const generated = await generateBirthdayMessage(
      classification.birthdayPersonName,
      config.openaiApiKey,
      config.generationModel
    );

    console.log(`🔍 HANDLER: Generated message: "${generated.message}"`);

    // Add a random delay to seem more natural
    const delayMs = Math.floor(
      Math.random() * (config.responseDelayMax - config.responseDelayMin) + config.responseDelayMin
    );
    
    console.log(`🔍 HANDLER: Will wait ${Math.round(delayMs / 1000)} seconds before sending`);
    
    if (config.dryRun) {
      console.log('\n' + '='.repeat(50));
      console.log('🎂 [DRY RUN] Would send birthday message:');
      console.log(`   For: ${classification.birthdayPersonName}`);
      console.log(`   Message: "${generated.message}"`);
      console.log(`   Delay: ${Math.round(delayMs / 1000)} seconds`);
      console.log('='.repeat(50) + '\n');
      recordWish(groupId, classification.birthdayPersonName);
      return;
    }

    await randomDelay(delayMs, delayMs);

    // Send the message
    await socket.sendMessage(groupId, { text: generated.message });
    recordWish(groupId, classification.birthdayPersonName);

    console.log('✅ HANDLER: Birthday message sent successfully!');

  } catch (error) {
    console.error('❌ HANDLER ERROR:', error);
  }
}

