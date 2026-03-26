/**
 * Utility functions for extracting names from birthday messages
 */

// Generic terms that are NOT real names (Hebrew terms of endearment)
// These should not be treated as birthday person names
export const GENERIC_TERMS = ['נשמה', 'חבר', 'חברה', 'יקיר', 'יקירה', 'מלך', 'מלכה', 'גבר', 'אח', 'אחי'];

/**
 * Try to extract a name from birthday message patterns using regex.
 * This is a fallback when AI classification fails due to context pollution.
 * Covers: "מזל טוב X", "יום הולדת שמח X", "@X מזל טוב", "happy birthday X"
 */
export function extractNameFromMazalTov(message: string): string | null {
  const patterns = [
    // "המון מזל טוב" patterns (most specific first)
    /המון\s+מזל\s*טוב\s+ל([א-ת]+)/i,
    /המון\s+מזל\s*טוב\s+([א-ת]+)/i,
    // "מזל טוב" patterns
    /מזל\s*טוב\s+ל([א-ת]+)/i,
    /מזל\s*טוב\s+([א-ת]+)/i,
    /מזל\s*טוב\s+([A-Za-z]+)/i,
    // "יום הולדת שמח" patterns
    /יום\s*הולדת\s*שמח\s+ל([א-ת]+)/i,
    /יום\s*הולדת\s*שמח\s+([א-ת]+)/i,
    /יום\s*הולדת\s*שמח\s+([A-Za-z]+)/i,
    // @mention patterns: @Name followed by birthday phrase
    /@([א-ת]{2,})\s+(?:מזל\s*טוב|יום\s*הולדת)/i,
    /@([A-Za-z]{2,})\s+(?:מזל\s*טוב|יום\s*הולדת|happy\s*birthday)/i,
    // "happy birthday" patterns
    /happy\s+birthday\s+([A-Za-z]+)/i,
    /happy\s+birthday\s+([א-ת]+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Filter out very short names (likely not real names), generic terms, and phone numbers
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
