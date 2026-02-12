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

// Track pending birthdays waiting for a name (when initial message has no name)
interface PendingBirthday {
  timestamp: number;
  messagesWaited: number;
}
const pendingBirthdays = new Map<string, PendingBirthday>();

// How many messages to wait for a name before using fallback
const PENDING_BIRTHDAY_MAX_MESSAGES = 3;

// Generic terms that are NOT real names (Hebrew terms of endearment)
// These should not be treated as birthday person names
const GENERIC_TERMS = ['נשמה', 'חבר', 'חברה', 'יקיר', 'יקירה', 'מלך', 'מלכה', 'גבר', 'אח', 'אחי'];

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

/**
 * Try to extract a name from "מזל טוב X" patterns using simple regex
 * This is a fallback when AI classification fails due to context pollution
 */
function extractNameFromMazalTov(message: string): string | null {
  // Patterns to match "מזל טוב [name]" in various forms
  const patterns = [
    /מזל\s*טוב\s+([א-ת]+)/i,          // מזל טוב שם
    /מזל\s*טוב\s+ל([א-ת]+)/i,         // מזל טוב לשם  
    /מזל\s*טוב\s+([A-Za-z]+)/i,       // מזל טוב Name
    /המון\s+מזל\s*טוב\s+([א-ת]+)/i,   // המון מזל טוב שם
    /המון\s+מזל\s*טוב\s+ל([א-ת]+)/i,  // המון מזל טוב לשם
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Filter out very short names (likely not real names) and generic terms
      if (name.length >= 2 && !GENERIC_TERMS.includes(name)) {
        return name;
      }
    }
  }
  
  return null;
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
 * Send a birthday message (extracted to reuse for pending birthdays)
 */
async function sendBirthdayMessage(groupId: string, name: string): Promise<void> {
  const socket = getSocket();
  if (!socket) {
    console.log('❌ Cannot send birthday message: socket not available');
    return;
  }

  console.log(`🎉 Sending birthday message for "${name}"...`);

  const generated = await generateBirthdayMessage(
    name,
    config.openaiApiKey,
    config.generationModel
  );

  console.log(`📝 Generated: "${generated.message}"`);

  const delayMs = Math.floor(
    Math.random() * (config.responseDelayMax - config.responseDelayMin) + config.responseDelayMin
  );

  if (config.dryRun) {
    console.log('\n' + '='.repeat(50));
    console.log('🎂 [DRY RUN] Would send birthday message:');
    console.log(`   For: ${name}`);
    console.log(`   Message: "${generated.message}"`);
    console.log(`   Delay: ${Math.round(delayMs / 1000)} seconds`);
    console.log('='.repeat(50) + '\n');
    recordWish(groupId, name);
    return;
  }

  console.log(`⏳ Waiting ${Math.round(delayMs / 1000)} seconds...`);
  await randomDelay(delayMs, delayMs);

  await socket.sendMessage(groupId, { text: generated.message });
  recordWish(groupId, name);

  console.log('✅ Birthday message sent!');
}

/**
 * Set a pending birthday that will wait for follow-up messages with a name
 */
function setPendingBirthday(groupId: string): void {
  pendingBirthdays.set(groupId, { timestamp: Date.now(), messagesWaited: 0 });
  console.log(`⏳ Set pending birthday, waiting for up to ${PENDING_BIRTHDAY_MAX_MESSAGES} messages to find a name...`);
}

/**
 * Clear a pending birthday
 */
function clearPendingBirthday(groupId: string): void {
  pendingBirthdays.delete(groupId);
}

/**
 * Check if there's a pending birthday and resolve it with a name
 */
async function resolvePendingBirthday(groupId: string, name: string): Promise<boolean> {
  if (!pendingBirthdays.has(groupId)) {
    return false;
  }

  console.log(`🎯 Found name "${name}" for pending birthday!`);
  clearPendingBirthday(groupId);

  if (canSendBirthdayWish(groupId)) {
    await sendBirthdayMessage(groupId, name);
    return true;
  } else {
    console.log('❌ Cannot send: daily limit reached');
    return false;
  }
}

/**
 * Increment pending birthday message count, return true if we should give up and use fallback
 */
async function incrementPendingAndCheckFallback(groupId: string): Promise<boolean> {
  const pending = pendingBirthdays.get(groupId);
  if (!pending) return false;

  pending.messagesWaited++;
  console.log(`⏳ Pending birthday: waited ${pending.messagesWaited}/${PENDING_BIRTHDAY_MAX_MESSAGES} messages`);

  if (pending.messagesWaited >= PENDING_BIRTHDAY_MAX_MESSAGES) {
    const FALLBACK_NAME = 'נשמה';
    console.log(`⏰ Max messages reached, using fallback "${FALLBACK_NAME}"`);
    clearPendingBirthday(groupId);

    if (canSendBirthdayWish(groupId)) {
      await sendBirthdayMessage(groupId, FALLBACK_NAME);
    } else {
      console.log('❌ Cannot send: daily limit reached');
    }
    return true;
  }

  return false;
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
    
    // Get message text (including captions from media messages)
    const messageBody = 
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      message.message?.documentMessage?.caption ||
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

    // Log the birthday name if detected
    if (classification.birthdayPersonName) {
      console.log(`📝 HANDLER: Detected birthday for "${classification.birthdayPersonName}"`);
    }

    // PRIORITY: Check for pending birthday BEFORE checking if it's a birthday message
    // This is important because context pollution (e.g., baby announcements) can cause
    // the AI to say "not a birthday" even when there's a valid name for our pending birthday
    if (pendingBirthdays.has(groupId)) {
      console.log('🔍 HANDLER: Pending birthday exists, checking for name in this message...');
      
      // Try to extract name - either from AI classification or from simple pattern matching
      let extractedName = classification.birthdayPersonName;
      
      // If AI didn't extract a name, try simple pattern matching for "מזל טוב X" 
      if (!extractedName) {
        extractedName = extractNameFromMazalTov(messageBody);
        if (extractedName) {
          console.log(`🔍 HANDLER: Pattern matching found potential name: "${extractedName}"`);
        }
      }
      
      const isValidName = extractedName && !GENERIC_TERMS.includes(extractedName.trim());
      
      if (isValidName && extractedName) {
        console.log(`🎯 HANDLER: Found valid name "${extractedName}" for pending birthday!`);
        await resolvePendingBirthday(groupId, extractedName);
        return;
      }
      
      // No valid name found - increment counter toward fallback
      console.log('🔍 HANDLER: No valid name found, incrementing pending counter...');
      await incrementPendingAndCheckFallback(groupId);
      return;
    }

    // Not a birthday message (and no pending birthday)
    if (!classification.isBirthday) {
      console.log('🔍 HANDLER: Not a birthday message');
      return;
    }

    // SMART NAME EXTRACTION for pending birthdays (legacy path - shouldn't reach here often)
    if (!classification.isInitialWish && pendingBirthdays.has(groupId)) {
      const followUpName = classification.birthdayPersonName;
      const isValidFollowUpName = followUpName && !GENERIC_TERMS.includes(followUpName.trim());
      
      if (isValidFollowUpName) {
        // Follow-up WITH valid name → use it!
        console.log(`🎯 HANDLER: Follow-up message has a valid name "${followUpName}", resolving pending birthday!`);
        await resolvePendingBirthday(groupId, followUpName);
      } else {
        // Follow-up WITHOUT valid name → increment counter, maybe use fallback
        if (followUpName) {
          console.log(`🔍 HANDLER: Follow-up has "${followUpName}" but it's a generic term, not counting as name`);
        }
        console.log('🔍 HANDLER: Follow-up without valid name, checking message count...');
        await incrementPendingAndCheckFallback(groupId);
      }
      return;
    }

    // Regular follow-up (no pending birthday) - skip
    if (!classification.isInitialWish) {
      console.log('🔍 HANDLER: Birthday follow-up, not initial wish');
      return;
    }

    // Low confidence
    if (classification.confidence < config.confidenceThreshold) {
      console.log(`🔍 HANDLER: Low confidence (${classification.confidence} < ${config.confidenceThreshold})`);
      return;
    }

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

    // INITIAL BIRTHDAY MESSAGE - check if we have a REAL name
    const extractedName = classification.birthdayPersonName;
    const isValidName = extractedName && !GENERIC_TERMS.includes(extractedName.trim());

    if (isValidName) {
      // We have a real name - send immediately
      console.log(`🎉 HANDLER: Initial birthday with name "${extractedName}"!`);
      await sendBirthdayMessage(groupId, extractedName);
    } else {
      // No name or generic term - set pending and wait for follow-ups to provide one
      console.log('🔍 HANDLER: Initial birthday detected but NO VALID NAME found');
      if (extractedName) {
        console.log(`🔍 HANDLER: Extracted "${extractedName}" is a generic term, not a real name`);
      }
      console.log('⏳ HANDLER: Setting pending birthday, waiting for follow-up messages with name...');
      setPendingBirthday(groupId);
    }

  } catch (error) {
    console.error('❌ HANDLER ERROR:', error);
  }
}

