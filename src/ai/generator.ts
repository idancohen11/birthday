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
  preferredLanguage: 'he' | 'en' | 'mixed' = 'mixed'
): Promise<GeneratedMessage> {
  const client = getClient(apiKey);
  
  // Add some randomness to language preference
  const languageChoice = preferredLanguage === 'mixed' 
    ? (Math.random() > 0.3 ? 'Hebrew' : 'English')  // 70% Hebrew, 30% English
    : (preferredLanguage === 'he' ? 'Hebrew' : 'English');
  
  const userPrompt = GENERATION_USER_PROMPT
    .replace('{name}', name)
    .replace('{language}', languageChoice);
  
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9, // Higher temperature for variety
      max_tokens: 100,
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
    
    // Fallback messages
    const fallbacks = [
      `יום הולדת שמח ${name}! 🎂`,
      `Happy birthday ${name}! 🎉`,
      `מזל טוב ${name}! 🎈`,
    ];
    
    return {
      message: fallbacks[Math.floor(Math.random() * fallbacks.length)],
      language: 'mixed',
    };
  }
}

