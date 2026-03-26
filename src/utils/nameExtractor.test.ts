import { describe, it, expect } from 'vitest';
import { extractNameFromMazalTov, isValidName, GENERIC_TERMS } from './nameExtractor.js';

describe('extractNameFromMazalTov', () => {
  describe('Hebrew names', () => {
    it('should extract name from "מזל טוב [name]"', () => {
      expect(extractNameFromMazalTov('מזל טוב ולנה 🎂🥳🎁🎈')).toBe('ולנה');
      expect(extractNameFromMazalTov('מזל טוב דנה!')).toBe('דנה');
      expect(extractNameFromMazalTov('מזל טוב יוסי')).toBe('יוסי');
    });

    it('should extract name from "מזל טוב ל[name]"', () => {
      expect(extractNameFromMazalTov('מזל טוב לדנה!')).toBe('דנה');
      expect(extractNameFromMazalTov('מזל טוב ליוסי')).toBe('יוסי');
    });

    it('should extract name from "המון מזל טוב [name]"', () => {
      expect(extractNameFromMazalTov('המון מזל טוב חקובו!!')).toBe('חקובו');
      expect(extractNameFromMazalTov('המון מזל טוב שרה')).toBe('שרה');
    });

    it('should extract name from "המון מזל טוב ל[name]"', () => {
      expect(extractNameFromMazalTov('המון מזל טוב לעידן')).toBe('עידן');
    });

    it('should handle names with emojis after them', () => {
      expect(extractNameFromMazalTov('מזל טוב ונטה 🎂🥳🎁🎈')).toBe('ונטה');
      expect(extractNameFromMazalTov('מזל טוב דניאל 🎉🎉🎉')).toBe('דניאל');
    });

    it('should handle extra whitespace', () => {
      expect(extractNameFromMazalTov('מזל  טוב   שרה')).toBe('שרה');
    });
  });

  describe('English names', () => {
    it('should extract English names', () => {
      expect(extractNameFromMazalTov('מזל טוב David!')).toBe('David');
      expect(extractNameFromMazalTov('מזל טוב Sarah')).toBe('Sarah');
    });
  });

  describe('generic terms filtering', () => {
    it('should NOT extract generic Hebrew terms of endearment', () => {
      expect(extractNameFromMazalTov('מזל טוב נשמה!')).toBeNull();
      expect(extractNameFromMazalTov('מזל טוב חבר')).toBeNull();
      expect(extractNameFromMazalTov('מזל טוב מלך')).toBeNull();
      expect(extractNameFromMazalTov('מזל טוב גבר')).toBeNull();
      expect(extractNameFromMazalTov('מזל טוב אחי')).toBeNull();
    });

    it('should return null for very short names (1 char)', () => {
      expect(extractNameFromMazalTov('מזל טוב א')).toBeNull();
    });
  });

  describe('no name cases', () => {
    it('should return null when no name pattern found', () => {
      expect(extractNameFromMazalTov('מזל טוב!')).toBeNull();
      expect(extractNameFromMazalTov('מזל טוב 🎂')).toBeNull();
      expect(extractNameFromMazalTov('יום הולדת שמח!')).toBeNull();
    });

    it('should return null for empty or non-birthday messages', () => {
      expect(extractNameFromMazalTov('')).toBeNull();
      expect(extractNameFromMazalTov('שלום לכולם')).toBeNull();
    });
  });

  describe('Hebrew names starting with ל', () => {
    it('should extract לילך from "מזל טוב לילך" (ל is part of name)', () => {
      expect(extractNameFromMazalTov('מזל טוב לילך')).toBe('לילך');
    });

    it('should extract לילך from "מזל טוב ללילך" (first ל is preposition)', () => {
      expect(extractNameFromMazalTov('מזל טוב ללילך')).toBe('לילך');
    });

    it('should extract לאה from "מזל טוב לאה" (ל is part of name)', () => {
      expect(extractNameFromMazalTov('מזל טוב לאה')).toBe('לאה');
    });

    it('should extract לאה from "מזל טוב ללאה" (first ל is preposition)', () => {
      expect(extractNameFromMazalTov('מזל טוב ללאה')).toBe('לאה');
    });

    it('should extract ליאת from "מזל טוב ליאת"', () => {
      expect(extractNameFromMazalTov('מזל טוב ליאת')).toBe('ליאת');
    });

    it('should extract לידור from "מזל טוב לידור"', () => {
      expect(extractNameFromMazalTov('מזל טוב לידור')).toBe('לידור');
    });

    it('should extract לידור from "מזל טוב ללידור" (preposition + lamed name)', () => {
      expect(extractNameFromMazalTov('מזל טוב ללידור')).toBe('לידור');
    });

    it('should extract לאורה from "מזל טוב לאורה"', () => {
      expect(extractNameFromMazalTov('מזל טוב לאורה')).toBe('לאורה');
    });

    it('should extract ליעד from "מזל טוב ליעד"', () => {
      expect(extractNameFromMazalTov('מזל טוב ליעד')).toBe('ליעד');
    });

    it('should extract לילך from "המון מזל טוב לילך"', () => {
      expect(extractNameFromMazalTov('המון מזל טוב לילך')).toBe('לילך');
    });

    it('should extract לילך from "המון מזל טוב ללילך"', () => {
      expect(extractNameFromMazalTov('המון מזל טוב ללילך')).toBe('לילך');
    });
  });

  describe('Parity: with and without ל preposition', () => {
    it('regular name: "מזל טוב דנה" and "מזל טוב לדנה" both extract דנה', () => {
      expect(extractNameFromMazalTov('מזל טוב דנה')).toBe('דנה');
      expect(extractNameFromMazalTov('מזל טוב לדנה')).toBe('דנה');
    });

    it('regular name with המון: "המון מזל טוב דנה" and "המון מזל טוב לדנה"', () => {
      expect(extractNameFromMazalTov('המון מזל טוב דנה')).toBe('דנה');
      expect(extractNameFromMazalTov('המון מזל טוב לדנה')).toBe('דנה');
    });

    it('lamed name: "מזל טוב לילך" and "מזל טוב ללילך" both extract לילך', () => {
      expect(extractNameFromMazalTov('מזל טוב לילך')).toBe('לילך');
      expect(extractNameFromMazalTov('מזל טוב ללילך')).toBe('לילך');
    });

    it('lamed name: "מזל טוב לאה" and "מזל טוב ללאה" both extract לאה', () => {
      expect(extractNameFromMazalTov('מזל טוב לאה')).toBe('לאה');
      expect(extractNameFromMazalTov('מזל טוב ללאה')).toBe('לאה');
    });
  });

  describe('LAMED_NAMES set coverage', () => {
    it('should restore ל for key names: לידור, לאורה, ליעד, לוטם, לביא', () => {
      // These names would have their ל stripped by the regex, but LAMED_NAMES restores it
      expect(extractNameFromMazalTov('מזל טוב לידור')).toBe('לידור');
      expect(extractNameFromMazalTov('מזל טוב לאורה')).toBe('לאורה');
      expect(extractNameFromMazalTov('מזל טוב ליעד')).toBe('ליעד');
      expect(extractNameFromMazalTov('מזל טוב לוטם')).toBe('לוטם');
      expect(extractNameFromMazalTov('מזל טוב לביא')).toBe('לביא');
    });
  });

  describe('real-world examples from logs', () => {
    it('should extract name from Velena birthday case', () => {
      // This was the actual message that was missed
      expect(extractNameFromMazalTov('מזל טוב ונטה 🎂🥳🎁🎈')).toBe('ונטה');
    });

    it('should extract name from Jacobo baby congratulation (but this is not birthday)', () => {
      // This should extract חקובו, but the handler should filter it as non-birthday
      expect(extractNameFromMazalTov('מזל טוב חקובו!! 😍😍😍🥳🥳🥳')).toBe('חקובו');
    });
  });
});

describe('isValidName', () => {
  it('should return true for valid Hebrew names', () => {
    expect(isValidName('עידן')).toBe(true);
    expect(isValidName('דנה')).toBe(true);
    expect(isValidName('יוסי')).toBe(true);
  });

  it('should return true for valid English names', () => {
    expect(isValidName('David')).toBe(true);
    expect(isValidName('Sarah')).toBe(true);
  });

  it('should return false for generic terms', () => {
    expect(isValidName('נשמה')).toBe(false);
    expect(isValidName('חבר')).toBe(false);
    expect(isValidName('מלך')).toBe(false);
    expect(isValidName('גבר')).toBe(false);
  });

  it('should return false for null/undefined/empty', () => {
    expect(isValidName(null)).toBe(false);
    expect(isValidName(undefined)).toBe(false);
    expect(isValidName('')).toBe(false);
  });

  it('should return false for very short names', () => {
    expect(isValidName('א')).toBe(false);
  });

  it('should handle whitespace', () => {
    expect(isValidName('  דנה  ')).toBe(true);
    expect(isValidName('  נשמה  ')).toBe(false);
  });
});

describe('GENERIC_TERMS', () => {
  it('should contain common Hebrew terms of endearment', () => {
    expect(GENERIC_TERMS).toContain('נשמה');
    expect(GENERIC_TERMS).toContain('חבר');
    expect(GENERIC_TERMS).toContain('חברה');
    expect(GENERIC_TERMS).toContain('יקיר');
    expect(GENERIC_TERMS).toContain('יקירה');
    expect(GENERIC_TERMS).toContain('מלך');
    expect(GENERIC_TERMS).toContain('מלכה');
    expect(GENERIC_TERMS).toContain('גבר');
    expect(GENERIC_TERMS).toContain('אח');
    expect(GENERIC_TERMS).toContain('אחי');
  });
});
