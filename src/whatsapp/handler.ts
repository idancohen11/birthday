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

// Track birthday wishes TODAY (persisted to file)
const BIRTHDAY_WISHES_FILE = path.join(process.cwd(), 'data', 'today_wishes.json');
const MAX_WISHES_PER_GROUP_PER_DAY = 2; // Allow 2 birthday messages per day (for rare cases of 2 birthdays)

interface TodayWishes {
  date: string; // YYYY-MM-DD
  wishCount: Record<string, number>; // groupId -> total wishes sent today
  wishedNames: Record<string, string[]>; // groupId -> names we've wished (for logging)
}

function getTodayString(): string {
  // Use 2:00 AM as the day boundary (for late-night messages)
  const now = new Date();
  const hour = now.getHours();
  
  // If it's before 2 AM, consider it still "yesterday"
  if (hour < 2) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  return now.toISOString().split('T')[0];
}

function loadTodayWishes(): TodayWishes {
  try {
    if (fs.existsSync(BIRTHDAY_WISHES_FILE)) {
      const data = JSON.parse(fs.readFileSync(BIRTHDAY_WISHES_FILE, 'utf-8'));
      // Reset if it's a new day
      if (data.date !== getTodayString()) {
        console.log('📅 New day detected, resetting wish tracking');
        return { date: getTodayString(), wishCount: {}, wishedNames: {} };
      }
      // Ensure fields exist (for backwards compatibility)
      if (!data.wishCount) data.wishCount = {};
      if (!data.wishedNames) data.wishedNames = {};
      return data;
    }
  } catch (e) {
    console.error('Error loading wishes file:', e);
  }
  return { date: getTodayString(), wishCount: {}, wishedNames: {} };
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

function getGroupWishCount(groupId: string): number {
  const data = loadTodayWishes();
  return data.wishCount[groupId] || 0;
}

function canSendBirthdayWish(groupId: string): boolean {
  return getGroupWishCount(groupId) < MAX_WISHES_PER_GROUP_PER_DAY;
}

function getWishedNames(groupId: string): string[] {
  const data = loadTodayWishes();
  return data.wishedNames[groupId] || [];
}

// Detect if message indicates an ADDITIONAL birthday (second person)
// These phrases signal "there's another birthday today"
function isAdditionalBirthdayMessage(message: string): boolean {
  const additionalPatterns = [
    /וגם\s*(מזל טוב|יום הולדת|birthday)/i,
    /ובנוסף\s*(מזל טוב|יום הולדת)/i,
    /גם\s*היום\s*יום הולדת/i,
    /עוד\s*יום הולדת/i,
    /יום הולדת\s*נוסף/i,
    /and\s*also\s*(happy\s*)?birthday/i,
    /another\s*birthday/i,
    /בנוסף.*יום הולדת/i,
    /יום הולדת.*בנוסף/i,
  ];
  
  return additionalPatterns.some(pattern => pattern.test(message));
}

function recordWish(groupId: string, name: string): void {
  const data = loadTodayWishes();
  
  // Increment count for group
  data.wishCount[groupId] = (data.wishCount[groupId] || 0) + 1;
  
  // Track the name (for logging purposes)
  if (!data.wishedNames[groupId]) {
    data.wishedNames[groupId] = [];
  }
  data.wishedNames[groupId].push(name);
  
  console.log(`📝 Recorded wish for "${name}" (total today: ${data.wishCount[groupId]}/${MAX_WISHES_PER_GROUP_PER_DAY})`);
  saveTodayWishes(data);
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

    // Log the birthday name if detected (even for follow-ups)
    if (classification.birthdayPersonName) {
      console.log(`📝 HANDLER: Detected birthday for "${classification.birthdayPersonName}"`);
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

    // Use fallback name if none detected (common when people just tag @phone)
    const FALLBACK_NAME = 'נשמה';
    const birthdayName = classification.birthdayPersonName || FALLBACK_NAME;
    
    if (!classification.birthdayPersonName) {
      console.log(`🔍 HANDLER: No name detected, using fallback "${FALLBACK_NAME}"`);
    }

    console.log(`🎉 HANDLER: Valid birthday wish detected for "${birthdayName}"!`);

    // Check birthday count and "additional" pattern
    const wishCount = getGroupWishCount(groupId);
    const previousNames = getWishedNames(groupId);
    const isAdditional = isAdditionalBirthdayMessage(messageBody);
    
    console.log(`🔍 HANDLER: Wish count today: ${wishCount}/${MAX_WISHES_PER_GROUP_PER_DAY}`);
    console.log(`🔍 HANDLER: Is "additional birthday" pattern: ${isAdditional}`);
    
    if (wishCount >= MAX_WISHES_PER_GROUP_PER_DAY) {
      console.log(`🔍 HANDLER: Already sent ${wishCount} message(s) today for: ${previousNames.join(', ')}`);
      console.log(`🔍 HANDLER: Reached daily limit. Skipping.`);
      return;
    }
    
    // For second birthday, require "additional" pattern (like "וגם מזל טוב ל...")
    if (wishCount === 1 && !isAdditional) {
      console.log(`🔍 HANDLER: Already sent 1 message today for: ${previousNames.join(', ')}`);
      console.log(`🔍 HANDLER: Second birthday requires "additional" pattern (וגם מזל טוב, etc). Skipping.`);
      return;
    }
    
    if (wishCount === 1 && isAdditional) {
      console.log(`✅ HANDLER: Detected SECOND birthday of the day with "additional" pattern!`);
    }

    // Generate a birthday message
    console.log('🔍 HANDLER: Generating birthday message...');
    const generated = await generateBirthdayMessage(
      birthdayName,
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
      console.log(`   For: ${birthdayName}`);
      console.log(`   Message: "${generated.message}"`);
      console.log(`   Delay: ${Math.round(delayMs / 1000)} seconds`);
      console.log('='.repeat(50) + '\n');
      recordWish(groupId, birthdayName);
      return;
    }

    await randomDelay(delayMs, delayMs);

    // Send the message
    await socket.sendMessage(groupId, { text: generated.message });
    recordWish(groupId, birthdayName);

    console.log('✅ HANDLER: Birthday message sent successfully!');

  } catch (error) {
    console.error('❌ HANDLER ERROR:', error);
  }
}

