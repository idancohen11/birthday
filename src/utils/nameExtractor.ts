/**
 * Utility functions for extracting names from birthday messages
 */

// Generic terms that are NOT real names (Hebrew terms of endearment)
// These should not be treated as birthday person names
export const GENERIC_TERMS = ['נשמה', 'חבר', 'חברה', 'יקיר', 'יקירה', 'מלך', 'מלכה', 'גבר', 'אח', 'אחי'];

// Common Hebrew names that start with ל — the ל is part of the name, not a "to/for" prefix
const LAMED_NAMES = new Set([
  'לילך', 'ליאור', 'ליאת', 'לירון', 'לימור', 'לאה', 'ליהי',
  'לירז', 'ליבי', 'ליאל', 'לירן', 'ליעד', 'לביא', 'לוטם',
  'לי', 'ליאן', 'לין', 'לנה',
]);

/**
 * Smart ל-prefix stripping: strip "ל" (meaning "to/for") from names,
 * but preserve names that genuinely start with ל (like לילך, ליאור).
 */
function stripLamedPrefix(nameWithLamed: string): string {
  // If the full word (with ל) is a known ל-name, keep it
  if (LAMED_NAMES.has(nameWithLamed)) {
    return nameWithLamed;
  }
  // Otherwise strip the ל prefix
  return nameWithLamed.slice(1);
}

/**
 * Try to extract a name from birthday message patterns using regex.
 * This is a fallback when AI classification fails due to context pollution.
 * Covers: "מזל טוב X", "יום הולדת שמח X", "@X מזל טוב", "happy birthday X"
 */
export function extractNameFromMazalTov(message: string): string | null {
  const patterns: { regex: RegExp; hasLamed?: boolean }[] = [
    // @mention AFTER birthday phrase: "מזל טוב ל @Name" or "מזל טוב ל@Name"
    { regex: /מזל\s*טוב\s+ל\s*@([A-Za-z]+)/i },
    { regex: /מזל\s*טוב\s+ל\s*@([א-ת]+)/i },
    // @mention BEFORE birthday phrase: "@Name מזל טוב"
    { regex: /@([א-ת]{2,})\s+(?:מזל\s*טוב|יום\s*הולדת)/i },
    { regex: /@([A-Za-z]{2,})\s+(?:מזל\s*טוב|יום\s*הולדת|happy\s*birthday)/i },
    // "המון מזל טוב" patterns (most specific first)
    { regex: /המון\s+מזל\s*טוב\s+ל([א-ת]+)/i, hasLamed: true },
    { regex: /המון\s+מזל\s*טוב\s+([א-ת]+)/i },
    // "מזל טוב" with ל prefix (captures word after ל)
    { regex: /מזל\s*טוב\s+ל([א-ת]+)/i, hasLamed: true },
    // "מזל טוב" without ל prefix
    { regex: /מזל\s*טוב\s+([א-ת]+)/i },
    { regex: /מזל\s*טוב\s+([A-Za-z]+)/i },
    // "יום הולדת שמח" patterns
    { regex: /יום\s*הולדת\s*שמח\s+ל([א-ת]+)/i, hasLamed: true },
    { regex: /יום\s*הולדת\s*שמח\s+([א-ת]+)/i },
    { regex: /יום\s*הולדת\s*שמח\s+([A-Za-z]+)/i },
    // "happy birthday" patterns
    { regex: /happy\s+birthday\s+([A-Za-z]+)/i },
    { regex: /happy\s+birthday\s+([א-ת]+)/i },
  ];

  for (const { regex, hasLamed } of patterns) {
    const match = message.match(regex);
    if (match && match[1]) {
      let name = match[1].trim();
      // For ל-prefix patterns, smartly decide whether to strip
      if (hasLamed) {
        name = stripLamedPrefix('ל' + name);
      }
      // Filter out very short names, generic terms, and phone numbers
      if (name.length >= 2 && !GENERIC_TERMS.includes(name) && !/^\+?\d+$/.test(name)) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Check if a name is a valid (non-generic) name
 */
export function isValidName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && !GENERIC_TERMS.includes(trimmed);
}
