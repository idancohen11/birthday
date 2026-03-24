import OpenAI from 'openai';
import { GeneratedMessage } from './types.js';
import { GENERATION_SYSTEM_PROMPT, GENERATION_USER_PROMPT, GENERATION_THEMES, BIRTHDAY_DISCLAIMER } from './prompts.js';
import { logger } from '../utils/logger.js';
import { isValidName } from '../utils/nameExtractor.js';

let openaiClient: OpenAI | null = null;

/** Replaces any name placeholder in text with the actual name. Never send user-facing text without calling this. */
export function replaceNamePlaceholder(text: string, name: string): string {
  return text
    .replace(/\{\s*name\s*\}/gi, name)
    .replace(/\[\s*שם\s*\]/g, name);
}

/** Ask LLM whether a string is a valid person's first name (Hebrew or English). Used to avoid putting invalid "names" in the message. */
async function validateNameWithLLM(
  client: OpenAI,
  name: string,
  model: string
): Promise<boolean> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: `Is "${name}" a valid Hebrew or English first name for a person (not a term of endearment like "sweetheart", not a common word)? Reply with exactly one word: yes or no.`,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });
    const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
    return answer === 'yes';
  } catch (e) {
    logger.warn('LLM name validation failed, falling back to rule-based only', { name, error: e });
    return false;
  }
}

const BLESSING_VALIDATION_PROMPT = `You are validating a birthday message (in Hebrew) for a WhatsApp group.

Answer "yes" if ALL of these are true:
1. The text is readable and coherent Hebrew (a sentence or two).
2. It starts with "מזל טוב".
3. It is related to a birthday.
4. It does not contain placeholders like {name} or [שם].

Ignore: the name after "מזל טוב" (already verified), any bot disclaimer at the end, occasional English words.

Reply with exactly one word: yes or no.`;

/** Thrown when no valid blessing could be generated after max attempts. Do not send. */
export class BlessingValidationFailedError extends Error {
  constructor(public readonly attempts: number) {
    super(`Birthday message failed validation after ${attempts} attempts`);
    this.name = 'BlessingValidationFailedError';
  }
}

/** Max number of generate+validate attempts before giving up and not sending. */
export const MAX_VALIDATION_ATTEMPTS = 5;

/** Ask LLM whether the full generated blessing is valid. Mandatory: on API failure returns false (do not send). */
async function validateBlessingWithLLM(
  client: OpenAI,
  fullMessage: string,
  model: string
): Promise<boolean> {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: BLESSING_VALIDATION_PROMPT },
        {
          role: 'user',
          // Strip the bot disclaimer before validation — it confuses the model
          content: `Is this birthday message valid?\n\n"""\n${fullMessage.split('\n\nגילוי נאות')[0]}\n"""`,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });
    const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
    return answer === 'yes';
  } catch (e) {
    logger.warn('LLM blessing validation failed – treating as invalid (mandatory validator)', {
      error: e,
    });
    return false;
  }
}

/**
 * Run generateUntil until validate returns true, up to maxAttempts times.
 * Exported for tests.
 */
export async function runGenerationWithValidation<T>(
  maxAttempts: number,
  generateOnce: () => Promise<T>,
  validate: (value: T) => Promise<boolean>
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const value = await generateOnce();
    const valid = await validate(value);
    if (valid) return value;
    logger.warn('Generated blessing failed validation, retrying', { attempt, maxAttempts });
  }
  throw new BlessingValidationFailedError(maxAttempts);
}

/** Pick a random theme to inject into the generation prompt for variety. Exported for tests. */
export function pickRandomTheme(): string {
  return GENERATION_THEMES[Math.floor(Math.random() * GENERATION_THEMES.length)];
}

/** Strip any leading "מזל טוב" / name the model might have included so we only have the body. Exported for tests. */
export function stripLeadingOpening(text: string, name?: string): string {
  let result = text;
  // Strip "מזל טוב נשמה!" first (most specific)
  result = result.replace(/^מזל\s*טוב\s*נשמה\s*!?\s*/i, '');
  // Strip "מזל טוב!" base prefix
  result = result.replace(/^מזל\s*טוב\s*!?\s*/i, '');
  // If the remaining text starts with the known name, strip it to avoid duplicates
  if (name) {
    const namePattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,!]?\\s*`, 'i');
    result = result.replace(namePattern, '');
  }
  return result.replace(/^[\s,]+/, '').trim();
}

/** Build the only allowed message structure: "מזל טוב! Name body" or "מזל טוב נשמה! body". Exported for tests. */
export function buildStructuredMessage(displayName: string, body: string): string {
  const prefix =
    displayName === 'נשמה' ? 'מזל טוב נשמה! ' : `מזל טוב! ${displayName} `;
  return prefix + body + BIRTHDAY_DISCLAIMER;
}

function getClient(apiKey: string): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/** Perform a single generation attempt (no validation). Used inside retry loop. */
async function generateOneAttempt(
  client: OpenAI,
  finalName: string,
  userPrompt: string,
  model: string,
  name: string
): Promise<GeneratedMessage> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  let body = content.replace(/^["']|["']$/g, '');
  body = stripLeadingOpening(body, finalName);
  body = replaceNamePlaceholder(body, finalName);
  if (!body) body = 'שנה טובה! 🎂';

  const isGenericFallback = finalName === 'חבר/ה' || finalName === 'נשמה';
  // Use the name if it passes the rule-based check (isValidName filters generic terms + short strings).
  // We removed the LLM name validation because gpt-4o-mini rejects valid Hebrew names like דנה, יוסי, etc.
  const displayName = (!isGenericFallback && isValidName(finalName)) ? finalName : 'נשמה';

  const message = buildStructuredMessage(displayName, body);
  const hasHebrew = /[\u0590-\u05FF]/.test(message);
  const hasEnglish = /[a-zA-Z]/.test(message);
  const language: 'he' | 'en' | 'mixed' =
    hasHebrew && hasEnglish ? 'mixed' : hasHebrew ? 'he' : 'en';

  return { message, language };
}

export async function generateBirthdayMessage(
  name: string,
  apiKey: string,
  model: string = 'gpt-4o-mini',
  _preferredLanguage: 'he' | 'en' | 'mixed' = 'he'
): Promise<GeneratedMessage> {
  const client = getClient(apiKey);

  const cleanName = name
    .replace(/^@/, '')
    .replace(/^\+?\d{10,}$/, '')
    .trim();
  const finalName = cleanName || 'חבר/ה';

  const generateOnce = () => {
    // Pick a fresh random theme for each attempt to maximize diversity
    const theme = pickRandomTheme();
    const userPrompt = GENERATION_USER_PROMPT
      .replace('{name}', finalName)
      .replace('{theme}', theme);
    logger.debug('Generation attempt with theme', { theme });
    return generateOneAttempt(client, finalName, userPrompt, model, name);
  };
  const validate = (result: GeneratedMessage) =>
    validateBlessingWithLLM(client, result.message, model);

  const result = await runGenerationWithValidation(
    MAX_VALIDATION_ATTEMPTS,
    generateOnce,
    validate
  );
  logger.debug('Generated birthday message', { name, message: result.message });
  return result;
}

