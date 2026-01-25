import OpenAI from 'openai';
import { GeneratedMessage } from './types.js';
import { GENERATION_SYSTEM_PROMPT, GENERATION_USER_PROMPT } from './prompts.js';
import { logger } from '../utils/logger.js';

let openaiClient: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function generateBirthdayMessage(
  name: string,
  apiKey: string,
  model: string = 'gpt-4o-mini',
  preferredLanguage: 'he' | 'en' | 'mixed' = 'he' // Default to Hebrew
): Promise<GeneratedMessage> {
  const client = getClient(apiKey);
  
  // Clean up name - remove @ prefix if present, remove phone number patterns
  const cleanName = name
    .replace(/^@/, '')
    .replace(/^\+?\d{10,}$/, '') // Remove if it's just a phone number
    .trim();
  
  // If name is empty or just a phone number, use a generic greeting
  const finalName = cleanName || 'חבר/ה';
  
  const userPrompt = GENERATION_USER_PROMPT
    .replace('{name}', finalName);
  
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // Balanced - creative but coherent
      max_tokens: 200, // Increased for longer messages + disclaimer
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Clean up any quotes that might be included
    const cleanedMessage = content.replace(/^["']|["']$/g, '');
    
    // Detect language
    const hasHebrew = /[\u0590-\u05FF]/.test(cleanedMessage);
    const hasEnglish = /[a-zA-Z]/.test(cleanedMessage);
    
    const language: 'he' | 'en' | 'mixed' = 
      hasHebrew && hasEnglish ? 'mixed' :
      hasHebrew ? 'he' : 'en';

    logger.debug('Generated birthday message', { name, message: cleanedMessage, language });

    return {
      message: cleanedMessage,
      language,
    };
  } catch (error) {
    logger.error('Message generation failed', { error, name });
    
    // Fallback messages (Hebrew only)
    const fallbacks = [
      `יום הולדת שמח ${finalName}! 🎂\n\nגילוי נאות: אני בוט שעידן כתב לזיהוי הודעות יום הולדת 🤖 אני עדיין בשלבי הרצה אז תהיו סלחנים אליי`,
      `מזל טוב ${finalName}! 🎈\n\nגילוי נאות: אני בוט שעידן כתב לזיהוי הודעות יום הולדת 🤖 אני עדיין בשלבי הרצה אז תהיו סלחנים אליי`,
      `${finalName}, יאללה מזל טוב! 🥳\n\nגילוי נאות: אני בוט שעידן כתב לזיהוי הודעות יום הולדת 🤖 אני עדיין בשלבי הרצה אז תהיו סלחנים אליי`,
    ];
    
    return {
      message: fallbacks[Math.floor(Math.random() * fallbacks.length)],
      language: 'he',
    };
  }
}

