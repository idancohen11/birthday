#!/usr/bin/env node
/**
 * Quick script to test birthday message generation variety.
 * Usage: npx tsx src/tools/test-generation.ts
 */
import { generateBirthdayMessage } from '../ai/index.js';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('No OPENAI_API_KEY in .env');
  process.exit(1);
}

async function main() {
  const names = ['דנה', 'יוסי', 'נשמה', 'עידן', 'שרה', 'David', 'אבי'];
  for (const name of names) {
    try {
      const result = await generateBirthdayMessage(name, key!);
      console.log(result.message);
      console.log('---');
    } catch (e) {
      console.error(`FAILED for ${name}:`, (e as Error).message);
      console.log('---');
    }
  }
}
main();
