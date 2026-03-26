/**
 * Utility functions for extracting names from birthday messages
 */

// Generic terms that are NOT real names (Hebrew terms of endearment)
// These should not be treated as birthday person names
export const GENERIC_TERMS = ['נשמה', 'חבר', 'חברה', 'יקיר', 'יקירה', 'מלך', 'מלכה', 'גבר', 'אח', 'אחי'];

// Common Hebrew names that start with ל — used to disambiguate "ל as preposition" vs "ל as name start"
export const LAMED_NAMES = new Set([
  'לילך', 'ליאור', 'ליאת', 'לירון', 'לימור', 'לאה', 'ליהי', 'לירז',
  'לנה', 'ליאל', 'לוטם', 'לביא', 'ליאם', 'לין', 'ליבי', 'לידור', 'לאורה', 'ליעד',
]);

interface NamePattern {
  regex: RegExp;
  stripsLamed: boolean;
}

/**
 * Try to extract a name from "מזל טוב X" patterns using simple regex
 * This is a fallback when AI classification fails due to context pollution
 */
export function extractNameFromMazalTov(message: string): string | null {
  // Patterns to match "מזל טוב [name]" in various forms
  // stripsLamed: true means the regex captures what's AFTER a ל prefix
  const patterns: NamePattern[] = [
    { regex: /המון\s+מזל\s*טוב\s+ל([א-ת]+)/i, stripsLamed: true },   // המון מזל טוב לשם
    { regex: /המון\s+מזל\s*טוב\s+([א-ת]+)/i,  stripsLamed: false },  // המון מזל טוב שם
    { regex: /מזל\s*טוב\s+ל([א-ת]+)/i,        stripsLamed: true },   // מזל טוב לשם
    { regex: /מזל\s*טוב\s+([א-ת]+)/i,         stripsLamed: false },  // מזל טוב שם (most generic Hebrew - check last)
    { regex: /מזל\s*טוב\s+([A-Za-z]+)/i,      stripsLamed: false },  // מזל טוב Name
  ];

  for (const { regex, stripsLamed } of patterns) {
    const match = message.match(regex);
    if (match && match[1]) {
      let name = match[1].trim();
      // If the pattern stripped a ל and the full name (with ל) is a known lamed-name, restore it
      if (stripsLamed && LAMED_NAMES.has('ל' + name)) {
        name = 'ל' + name;
      }
      // Filter out very short names (likely not real names) and generic terms
      if (name.length >= 2 && !GENERIC_TERMS.includes(name)) {
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
