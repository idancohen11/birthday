/**
 * Utility functions for extracting names from birthday messages
 */

// Generic terms that are NOT real names (Hebrew terms of endearment)
// These should not be treated as birthday person names
export const GENERIC_TERMS = ['נשמה', 'חבר', 'חברה', 'יקיר', 'יקירה', 'מלך', 'מלכה', 'גבר', 'אח', 'אחי'];

/**
 * Try to extract a name from "מזל טוב X" patterns using simple regex
 * This is a fallback when AI classification fails due to context pollution
 */
export function extractNameFromMazalTov(message: string): string | null {
  // Patterns to match "מזל טוב [name]" in various forms
  // Note: patterns with ל prefix need to NOT capture the ל
  const patterns = [
    /המון\s+מזל\s*טוב\s+ל([א-ת]+)/i,  // המון מזל טוב לשם (check first - more specific)
    /המון\s+מזל\s*טוב\s+([א-ת]+)/i,   // המון מזל טוב שם
    /מזל\s*טוב\s+ל([א-ת]+)/i,         // מזל טוב לשם  
    /מזל\s*טוב\s+([א-ת]+)/i,          // מזל טוב שם (most generic Hebrew - check last)
    /מזל\s*טוב\s+([A-Za-z]+)/i,       // מזל טוב Name
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

/**
 * Check if a name is a valid (non-generic) name
 */
export function isValidName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && !GENERIC_TERMS.includes(trimmed);
}
