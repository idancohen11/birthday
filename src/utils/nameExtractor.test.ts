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

  describe('יום הולדת שמח patterns', () => {
    it('should extract name from "יום הולדת שמח ל[name]"', () => {
      expect(extractNameFromMazalTov('יום הולדת שמח לדנה!')).toBe('דנה');
      expect(extractNameFromMazalTov('יום הולדת שמח ליוסי')).toBe('יוסי');
    });

    it('should extract name from "יום הולדת שמח [name]"', () => {
      expect(extractNameFromMazalTov('יום הולדת שמח דנה!')).toBe('דנה');
      expect(extractNameFromMazalTov('יום הולדת שמח עידן')).toBe('עידן');
    });

    it('should NOT extract generic terms from יום הולדת שמח patterns', () => {
      expect(extractNameFromMazalTov('יום הולדת שמח נשמה!')).toBeNull();
      expect(extractNameFromMazalTov('יום הולדת שמח חבר')).toBeNull();
      expect(extractNameFromMazalTov('יום הולדת שמח מלך')).toBeNull();
    });
  });

  describe('@mention patterns', () => {
    it('should extract name from "@[name] מזל טוב"', () => {
      expect(extractNameFromMazalTov('@דנה מזל טוב!')).toBe('דנה');
      expect(extractNameFromMazalTov('@יוסי מזל טוב')).toBe('יוסי');
    });

    it('should extract name from "@[name] יום הולדת שמח"', () => {
      expect(extractNameFromMazalTov('@דנה יום הולדת שמח!')).toBe('דנה');
    });

    it('should extract English @mentions', () => {
      expect(extractNameFromMazalTov('@David happy birthday!')).toBe('David');
      expect(extractNameFromMazalTov('@Sarah מזל טוב')).toBe('Sarah');
    });

    it('should NOT extract phone numbers from @mentions', () => {
      expect(extractNameFromMazalTov('@972501234567 מזל טוב!')).toBeNull();
      expect(extractNameFromMazalTov('@+972501234567 יום הולדת שמח!')).toBeNull();
    });
  });

  describe('happy birthday (English) patterns', () => {
    it('should extract name from "happy birthday [name]"', () => {
      expect(extractNameFromMazalTov('Happy birthday David!')).toBe('David');
      expect(extractNameFromMazalTov('happy birthday Sarah')).toBe('Sarah');
    });

    it('should extract Hebrew name from "happy birthday [name]"', () => {
      expect(extractNameFromMazalTov('Happy birthday דנה!')).toBe('דנה');
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

  describe('Hebrew names starting with ל (lamed)', () => {
    it('should preserve לילך and not strip the ל', () => {
      expect(extractNameFromMazalTov('מזל טוב לילך אהובה 🥰')).toBe('לילך');
    });

    it('should preserve ליאור and not strip the ל', () => {
      expect(extractNameFromMazalTov('מזל טוב ליאור!')).toBe('ליאור');
    });

    it('should preserve ליאת and not strip the ל', () => {
      expect(extractNameFromMazalTov('מזל טוב ליאת 🎂')).toBe('ליאת');
    });

    it('should still strip ל prefix for non-lamed names', () => {
      expect(extractNameFromMazalTov('מזל טוב לדנה!')).toBe('דנה');
      expect(extractNameFromMazalTov('מזל טוב ליוסי')).toBe('יוסי');
      expect(extractNameFromMazalTov('מזל טוב לעידן')).toBe('עידן');
    });
  });

  describe('@mention after birthday phrase', () => {
    it('should extract from "מזל טוב ל @Name"', () => {
      expect(extractNameFromMazalTov('מזל טוב ל @Lilach Vardy !! 🎂')).toBe('Lilach');
    });

    it('should extract from "מזל טוב ל@Name"', () => {
      expect(extractNameFromMazalTov('מזל טוב ל@David!')).toBe('David');
    });

    it('should extract Hebrew @mention after birthday phrase', () => {
      expect(extractNameFromMazalTov('מזל טוב ל @לילך !!')).toBe('לילך');
    });

    it('should ignore phone number @mentions after birthday phrase', () => {
      expect(extractNameFromMazalTov('מזל טוב ל @972501234567 !!')).toBeNull();
    });
  });

  describe('real-world examples from logs', () => {
    it('should extract name from Velena birthday case', () => {
      expect(extractNameFromMazalTov('מזל טוב ונטה 🎂🥳🎁🎈')).toBe('ונטה');
    });

    it('should extract name from Jacobo baby congratulation (but this is not birthday)', () => {
      expect(extractNameFromMazalTov('מזל טוב חקובו!! 😍😍😍🥳🥳🥳')).toBe('חקובו');
    });

    it('should extract Lilach from real message with @mention', () => {
      expect(extractNameFromMazalTov('בוקר טיל לכולם ומזל טוב ל @Lilach Vardy !! מלא אושר')).toBe('Lilach');
    });

    it('should extract לילך from follow-up message', () => {
      expect(extractNameFromMazalTov('מזל טוב לילך אהובה 🥰')).toBe('לילך');
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
