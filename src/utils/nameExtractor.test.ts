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
