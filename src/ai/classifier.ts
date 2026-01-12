import OpenAI from 'openai';
import { ClassificationResult } from './types.js';
import { CLASSIFICATION_SYSTEM_PROMPT, CLASSIFICATION_USER_PROMPT, CONTEXT_HEADER } from './prompts.js';
import { logger } from '../utils/logger.js';

let openaiClient: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export interface MessageContext {
  /** Recent messages in the group for context */
  recentMessages?: string[];
}

export async function classifyMessage(
  message: string,
  apiKey: string,
  model: string = 'gpt-4o-mini',
  context?: MessageContext
): Promise<ClassificationResult> {
  const client = getClient(apiKey);
  
  // Build context section if recent messages are provided
  let contextSection = '';
  if (context?.recentMessages && context.recentMessages.length > 0) {
    const recentMessagesText = context.recentMessages.join('\n');
    contextSection = CONTEXT_HEADER.replace('{recentMessages}', recentMessagesText);
  }
  
  const userPrompt = CLASSIFICATION_USER_PROMPT
    .replace('{context}', contextSection)
    .replace('{message}', message);
  
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // Low temperature for consistent classification
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const result = JSON.parse(content) as ClassificationResult;
    
    logger.debug('Classification result', { 
      message: message.substring(0, 50), 
      hasContext: !!context?.recentMessages?.length,
      result 
    });

    return result;
  } catch (error) {
    logger.error('Classification failed', { error, message: message.substring(0, 50) });
    
    // Return safe default on error
    return {
      isBirthday: false,
      isInitialWish: false,
      birthdayPersonName: null,
      confidence: 0,
      reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Quick pre-filter using keywords before calling OpenAI (saves API calls)
 */
export function mightBeBirthdayMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  const birthdayKeywords = [
    'birthday',
    'bday',
    'b-day',
    'יום הולדת',
    'יומולדת',
    'הולדת',
    'מזל טוב',
    'מזלטוב',
    '🎂',
    '🎈',
    '🎉',
    '🥳',
    '🎁',
  ];
  
  return birthdayKeywords.some(keyword => 
    lowerMessage.includes(keyword) || message.includes(keyword)
  );
}
