import { describe, it, expect } from 'vitest';

/**
 * These tests verify the name inclusion logic without mocking OpenAI.
 * We test the pure logic functions that ensure names appear in messages.
 */

// Helper function that mimics the safety check in generator.ts
function ensureNameInMessage(message: string, name: string): string {
  const cleanName = name.replace(/^@/, '').replace(/^\+?\d{10,}$/, '').trim();
  const finalName = cleanName || 'חבר/ה';
  
  const isGenericName = finalName === 'חבר/ה' || finalName === 'נשמה';
  if (!isGenericName && !message.includes(finalName)) {
    return `${finalName}, ${message}`;
  }
  return message;
}

// Helper to clean name (mimics generator logic)
function cleanName(name: string): string {
  return name.replace(/^@/, '').replace(/^\+?\d{10,}$/, '').trim() || 'חבר/ה';
}

describe('Name inclusion safety check', () => {
  describe('ensureNameInMessage', () => {
    it('should prepend name if message does not contain it', () => {
      const message = 'מזל טוב! עוד שנה של לקום לעבודה. 🎂';
      const result = ensureNameInMessage(message, 'עידן');
      
      expect(result).toBe('עידן, מזל טוב! עוד שנה של לקום לעבודה. 🎂');
      expect(result.startsWith('עידן,')).toBe(true);
    });

    it('should NOT prepend name if message already contains it', () => {
      const message = 'עידן, מזל טוב! עוד שנה של לקום לעבודה. 🎂';
      const result = ensureNameInMessage(message, 'עידן');
      
      expect(result).toBe(message); // unchanged
      expect(result).not.toMatch(/^עידן,\s*עידן/); // no double name
    });

    it('should NOT prepend generic name נשמה', () => {
      const message = 'מזל טוב! עוד שנה של לקום לעבודה. 🎂';
      const result = ensureNameInMessage(message, 'נשמה');
      
      expect(result).toBe(message); // unchanged
      expect(result.startsWith('נשמה,')).toBe(false);
    });

    it('should NOT prepend generic name חבר/ה', () => {
      const message = 'מזל טוב! עוד שנה של לקום לעבודה. 🎂';
      const result = ensureNameInMessage(message, 'חבר/ה');
      
      expect(result).toBe(message); // unchanged
      expect(result.startsWith('חבר/ה,')).toBe(false);
    });

    it('should handle empty name by treating as generic', () => {
      const message = 'מזל טוב! 🎂';
      const result = ensureNameInMessage(message, '');
      
      expect(result).toBe(message); // unchanged - empty becomes חבר/ה which is generic
    });

    it('should work with English names', () => {
      const message = 'מזל טוב! Happy birthday! 🎂';
      const result = ensureNameInMessage(message, 'David');
      
      expect(result).toBe('David, מזל טוב! Happy birthday! 🎂');
    });

    it('should work with Hebrew names anywhere in message', () => {
      const message = 'יום הולדת שמח דנה! 🎂';
      const result = ensureNameInMessage(message, 'דנה');
      
      expect(result).toBe(message); // unchanged - name already present
    });
  });

  describe('cleanName', () => {
    it('should remove @ prefix', () => {
      expect(cleanName('@דנה')).toBe('דנה');
      expect(cleanName('@David')).toBe('David');
    });

    it('should return fallback for phone numbers', () => {
      expect(cleanName('+972501234567')).toBe('חבר/ה');
      expect(cleanName('972501234567')).toBe('חבר/ה');
    });

    it('should return fallback for empty string', () => {
      expect(cleanName('')).toBe('חבר/ה');
    });

    it('should trim whitespace', () => {
      expect(cleanName('  דנה  ')).toBe('דנה');
    });
  });
});

describe('Real-world test cases from production bugs', () => {
  it('should fix the Idan Cohen bug - name was omitted from message', () => {
    // This was the actual bug: AI generated message without name
    const aiGeneratedMessage = 'מזל טוב! עוד שנה של לקום למשרד ולהרגיש כאילו אתה על מסלול המירוצים של החיים. 🎂';
    const name = 'עידן כהן';
    
    const result = ensureNameInMessage(aiGeneratedMessage, name);
    
    expect(result).toContain('עידן כהן');
    expect(result.startsWith('עידן כהן,')).toBe(true);
  });

  it('should fix the Velena/Vaneta bug - name extraction worked but generation failed', () => {
    // Name was extracted as ונטה, but message didn't include it
    const aiGeneratedMessage = 'מזל טוב! שתהיה לך שנה מדהימה! 🎂';
    const name = 'ונטה';
    
    const result = ensureNameInMessage(aiGeneratedMessage, name);
    
    expect(result).toContain('ונטה');
    expect(result.startsWith('ונטה,')).toBe(true);
  });
});
