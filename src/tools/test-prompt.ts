#!/usr/bin/env node
/**
 * Interactive CLI tool for testing birthday message classification and generation.
 * Use this to iterate on prompts without connecting to WhatsApp.
 * 
 * Usage:
 *   npm run test-prompt
 *   
 * Commands:
 *   - Type any message to test classification
 *   - Type "generate <name>" to test message generation
 *   - Type "context" to enter context mode (simulate conversation)
 *   - Type "batch" to run all test fixtures
 *   - Type "exit" or Ctrl+C to quit
 */

import readline from 'readline';
import { classifyMessage, mightBeBirthdayMessage, generateBirthdayMessage } from '../ai/index.js';
import { resolveGender } from '../utils/genderMap.js';
import { testMessages } from './test-fixtures.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY not found in environment variables');
  console.error('   Copy env.example to .env and add your API key');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Store context messages for context mode
let contextMessages: string[] = [];
let inContextMode = false;

function printHeader() {
  console.log('\n' + '='.repeat(60));
  console.log('🎂 Birthday Bot - Prompt Tester');
  console.log('='.repeat(60));
  console.log('\nCommands:');
  console.log('  <message>        Test classification of a message');
  console.log('  generate <name>  Generate a birthday wish for <name>');
  console.log('  context          Enter context mode (simulate conversation)');
  console.log('  batch            Run all test fixtures');
  console.log('  exit             Quit the tester\n');
}

async function testClassification(message: string, context?: string[]) {
  console.log('\n📝 Testing message:', message);
  
  if (context && context.length > 0) {
    console.log('\n📋 With context:');
    context.forEach(msg => console.log(`   ${msg}`));
  }
  
  console.log('-'.repeat(40));
  
  // Quick pre-filter check
  const mightBe = mightBeBirthdayMessage(message);
  console.log(`🔍 Pre-filter (keyword check): ${mightBe ? '✅ Might be birthday' : '❌ No birthday keywords'}`);
  
  if (!mightBe) {
    console.log('   (Would skip OpenAI call in production to save costs)');
    console.log('   Calling OpenAI anyway for testing...\n');
  }
  
  // Full classification with context
  const result = await classifyMessage(
    message, 
    OPENAI_API_KEY!, 
    'gpt-4o-mini',
    context ? { recentMessages: context } : undefined
  );
  
  console.log('\n📊 Classification Result:');
  console.log(`   Is Birthday:     ${result.isBirthday ? '✅ Yes' : '❌ No'}`);
  console.log(`   Is Initial Wish: ${result.isInitialWish ? '✅ Yes' : '❌ No'}`);
  console.log(`   Person Name:     ${result.birthdayPersonName || '(not detected)'}`);
  console.log(`   Confidence:      ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`   Reasoning:       ${result.reasoning || '(none)'}`);
  
  // If it's a valid birthday message, show what response would be generated
  if (result.isBirthday && result.isInitialWish && result.birthdayPersonName) {
    console.log('\n🎉 This is a valid initial birthday wish!');
    console.log('   Generating response...\n');
    
    const gender = resolveGender(result.birthdayPersonName);
    const response = await generateBirthdayMessage(result.birthdayPersonName, OPENAI_API_KEY!, 'gpt-4o-mini', gender);
    console.log(`💬 Would respond (${gender}): "${response.message}"`);
    console.log(`   Language: ${response.language}`);
  }
  
  return result;
}

async function testGeneration(name: string) {
  const gender = resolveGender(name);
  console.log(`\n🎁 Generating birthday wishes for "${name}" (gender: ${gender})...\n`);

  // Generate a few variations
  for (let i = 0; i < 3; i++) {
    const response = await generateBirthdayMessage(name, OPENAI_API_KEY!, 'gpt-4o-mini', gender);
    console.log(`   ${i + 1}. "${response.message}" (${response.language})`);
  }
}

async function runBatchTest() {
  console.log('\n🧪 Running batch test with all fixtures...\n');
  
  let correct = 0;
  let total = 0;
  
  // Test initial birthday messages
  console.log('📍 Testing INITIAL birthday messages (should detect as initial):');
  for (const msg of testMessages.birthday_initial) {
    total++;
    const result = await classifyMessage(msg, OPENAI_API_KEY!);
    const passed = result.isBirthday && result.isInitialWish;
    if (passed) correct++;
    console.log(`   ${passed ? '✅' : '❌'} "${msg.substring(0, 40)}..."`);
    if (!passed) {
      console.log(`      Expected: initial wish, Got: isBirthday=${result.isBirthday}, isInitial=${result.isInitialWish}`);
    }
  }
  
  // Test follow-up messages
  console.log('\n📍 Testing FOLLOW-UP messages (should NOT detect as initial):');
  for (const msg of testMessages.birthday_followup) {
    total++;
    const result = await classifyMessage(msg, OPENAI_API_KEY!);
    const passed = result.isBirthday && !result.isInitialWish;
    if (passed) correct++;
    console.log(`   ${passed ? '✅' : '❌'} "${msg}"`);
    if (!passed) {
      console.log(`      Expected: follow-up, Got: isBirthday=${result.isBirthday}, isInitial=${result.isInitialWish}`);
    }
  }
  
  // Test non-birthday messages
  console.log('\n📍 Testing NON-BIRTHDAY messages (should NOT detect as birthday):');
  for (const msg of testMessages.not_birthday) {
    total++;
    const result = await classifyMessage(msg, OPENAI_API_KEY!);
    const passed = !result.isBirthday;
    if (passed) correct++;
    console.log(`   ${passed ? '✅' : '❌'} "${msg.substring(0, 40)}..."`);
    if (!passed) {
      console.log(`      Expected: not birthday, Got: isBirthday=${result.isBirthday}`);
    }
  }
  
  console.log('\n' + '='.repeat(40));
  console.log(`📊 Results: ${correct}/${total} tests passed (${((correct/total)*100).toFixed(0)}%)`);
}

async function runContextTest() {
  console.log('\n🔄 Context Mode Test - Simulating a conversation\n');
  console.log('This tests if the bot correctly identifies follow-ups with context.\n');
  
  const conversation = [
    { msg: 'יום הולדת שמח לדני! 🎂', isInitial: true, name: 'דני' },
    { msg: 'מזל טוב!', isInitial: false, name: null },
    { msg: '🎉🎉', isInitial: false, name: null },
    { msg: 'יום הולדת שמח!', isInitial: false, name: null },
    { msg: 'מצטרף למאחלים!', isInitial: false, name: null },
  ];
  
  const context: string[] = [];
  let correct = 0;
  
  for (const { msg, isInitial, name } of conversation) {
    const result = await classifyMessage(msg, OPENAI_API_KEY!, 'gpt-4o-mini', { recentMessages: context });
    
    const expectedInitial = isInitial;
    const passed = result.isInitialWish === expectedInitial;
    if (passed) correct++;
    
    const status = passed ? '✅' : '❌';
    const expected = isInitial ? 'INITIAL' : 'FOLLOW-UP';
    const got = result.isInitialWish ? 'INITIAL' : 'FOLLOW-UP';
    
    console.log(`${status} "${msg}"`);
    console.log(`   Expected: ${expected}, Got: ${got}, Name: ${result.birthdayPersonName || '(none)'}`);
    
    // Add to context for next message
    const time = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    context.push(`[${time}] ${msg}`);
  }
  
  console.log('\n' + '='.repeat(40));
  console.log(`📊 Context Test Results: ${correct}/${conversation.length} passed`);
}

function enterContextMode() {
  inContextMode = true;
  contextMessages = [];
  console.log('\n📋 CONTEXT MODE ACTIVATED');
  console.log('   Type messages to build conversation context.');
  console.log('   Type "test <message>" to test classification with current context.');
  console.log('   Type "show" to see current context.');
  console.log('   Type "clear" to clear context.');
  console.log('   Type "done" to exit context mode.\n');
}

async function handleContextMode(input: string) {
  const trimmed = input.trim();
  
  if (trimmed === 'done') {
    inContextMode = false;
    contextMessages = [];
    console.log('📋 Exited context mode.\n');
    return;
  }
  
  if (trimmed === 'show') {
    if (contextMessages.length === 0) {
      console.log('   (no context messages yet)');
    } else {
      console.log('\n📋 Current context:');
      contextMessages.forEach(msg => console.log(`   ${msg}`));
    }
    return;
  }
  
  if (trimmed === 'clear') {
    contextMessages = [];
    console.log('   Context cleared.');
    return;
  }
  
  if (trimmed.startsWith('test ')) {
    const messageToTest = trimmed.substring(5);
    await testClassification(messageToTest, contextMessages);
    return;
  }
  
  // Add message to context
  const time = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  contextMessages.push(`[${time}] ${trimmed}`);
  console.log(`   Added to context (${contextMessages.length} messages)`);
}

async function handleInput(input: string) {
  const trimmed = input.trim();
  
  if (!trimmed) return;
  
  // Handle context mode
  if (inContextMode) {
    await handleContextMode(trimmed);
    return;
  }
  
  if (trimmed.toLowerCase() === 'exit') {
    console.log('\n👋 Goodbye!\n');
    rl.close();
    process.exit(0);
  }
  
  if (trimmed.toLowerCase() === 'batch') {
    await runBatchTest();
    return;
  }
  
  if (trimmed.toLowerCase() === 'context') {
    enterContextMode();
    return;
  }
  
  if (trimmed.toLowerCase() === 'contexttest') {
    await runContextTest();
    return;
  }
  
  if (trimmed.toLowerCase().startsWith('generate ')) {
    const name = trimmed.substring(9).trim();
    if (name) {
      await testGeneration(name);
    } else {
      console.log('❌ Please provide a name: generate <name>');
    }
    return;
  }
  
  // Default: classify the message
  await testClassification(trimmed);
}

// Main loop
printHeader();

rl.on('line', async (input) => {
  try {
    await handleInput(input);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
  console.log('\n' + '-'.repeat(60));
  const prompt = inContextMode ? '[context]> ' : '> ';
  process.stdout.write(prompt);
});

rl.on('close', () => {
  console.log('\n👋 Goodbye!\n');
  process.exit(0);
});

process.stdout.write('> ');
