import { describe, it, expect } from 'vitest';
import {
  replaceNamePlaceholder,
  buildStructuredMessage,
  stripLeadingOpening,
  runGenerationWithValidation,
  BlessingValidationFailedError,
  MAX_VALIDATION_ATTEMPTS,
} from './generator.js';
import { BIRTHDAY_DISCLAIMER, getGenerationUserPrompt } from './prompts.js';

describe('replaceNamePlaceholder', () => {
  it('replaces {name} with actual name', () => {
    expect(replaceNamePlaceholder('מלכת האוטומציות, {name}, מזל טוב!', 'Hen')).toBe(
      'מלכת האוטומציות, Hen, מזל טוב!'
    );
  });

  it('replaces **{name}** (model sometimes copies with markdown)', () => {
    expect(replaceNamePlaceholder('מלכת האוטומציות, **{name}**, מזל טוב!', 'Hen')).toBe(
      'מלכת האוטומציות, **Hen**, מזל טוב!'
    );
  });

  it('replaces multiple occurrences', () => {
    expect(replaceNamePlaceholder('{name} מזל טוב {name}!', 'דנה')).toBe('דנה מזל טוב דנה!');
  });

  it('replaces [שם] placeholder', () => {
    expect(replaceNamePlaceholder('[שם], יאללה מזל טוב!', 'עידן')).toBe('עידן, יאללה מזל טוב!');
  });

  it('returns unchanged text when no placeholder', () => {
    const msg = 'עידן, מזל טוב! שנה טובה. 🎂';
    expect(replaceNamePlaceholder(msg, 'עידן')).toBe(msg);
  });
});

describe('Strict message structure (buildStructuredMessage)', () => {
  it('with valid name: starts with "מזל טוב! " then name then body', () => {
    const msg = buildStructuredMessage('עידן', 'עוד שנה של עבודה. תהנה מהעוגה 🎂');
    expect(msg).toMatch(/^מזל טוב! עידן /);
    expect(msg).toContain('עוד שנה של עבודה');
    expect(msg).toContain(BIRTHDAY_DISCLAIMER.trim());
  });

  it('with נשמה: starts with "מזל טוב נשמה! " then body', () => {
    const msg = buildStructuredMessage('נשמה', 'שנה טובה! 🎂');
    expect(msg).toMatch(/^מזל טוב נשמה! /);
    expect(msg).toContain('שנה טובה!');
  });

  it('every message starts with "מזל טוב"', () => {
    expect(buildStructuredMessage('Hen', 'body')).toMatch(/^מזל טוב/);
    expect(buildStructuredMessage('נשמה', 'body')).toMatch(/^מזל טוב/);
  });

  it('every message includes disclaimer', () => {
    expect(buildStructuredMessage('דנה', 'ברכה')).toContain('גילוי נאות');
    expect(buildStructuredMessage('נשמה', 'ברכה')).toContain('גילוי נאות');
  });
});

describe('stripLeadingOpening', () => {
  it('strips "מזל טוב נשמה! " leaving only body', () => {
    expect(stripLeadingOpening('מזל טוב נשמה! שנה טובה 🎂')).toBe('שנה טובה 🎂');
  });

  it('strips "מזל טוב! Name " leaving only body', () => {
    expect(stripLeadingOpening('מזל טוב! עידן עוד שנה של עבודה 🎂')).toBe(
      'עוד שנה של עבודה 🎂'
    );
  });

  it('leaves body unchanged when no leading opening', () => {
    const body = 'עוד שנה של פגישות מיותרות 🥳';
    expect(stripLeadingOpening(body)).toBe(body);
  });
});

function cleanName(name: string): string {
  return name.replace(/^@/, '').replace(/^\+?\d{10,}$/, '').trim() || 'חבר/ה';
}

describe('cleanName (generator-style)', () => {
  it('should remove @ prefix', () => {
    expect(cleanName('@דנה')).toBe('דנה');
    expect(cleanName('@David')).toBe('David');
  });

  it('should return fallback for phone numbers', () => {
    expect(cleanName('+972501234567')).toBe('חבר/ה');
  });

  it('should return fallback for empty string', () => {
    expect(cleanName('')).toBe('חבר/ה');
  });
});

describe('Production bugs – must not regress', () => {
  it('must never send literal {name}', () => {
    const sanitized = replaceNamePlaceholder('מלכת האוטומציות, **{name}**, מזל טוב!', 'Hen');
    expect(sanitized).not.toContain('{name}');
    expect(sanitized).toContain('Hen');
  });

  it('final message must follow only allowed structure', () => {
    const withName = buildStructuredMessage('Hen', 'עוד שנה 🎂');
    expect(withName).toMatch(/^מזל טוב! Hen /);
    const noName = buildStructuredMessage('נשמה', 'שנה טובה 🎂');
    expect(noName).toMatch(/^מזל טוב נשמה! /);
  });
});

describe('getGenerationUserPrompt', () => {
  it('includes "מין: זכר" for male', () => {
    expect(getGenerationUserPrompt('עידן', 'male')).toContain('מין: זכר');
  });

  it('includes "מין: נקבה" for female', () => {
    expect(getGenerationUserPrompt('דנה', 'female')).toContain('מין: נקבה');
  });

  it('includes "מין: ניטרלי" for neutral', () => {
    expect(getGenerationUserPrompt('אור', 'neutral')).toContain('מין: ניטרלי');
  });

  it('includes the name in the prompt', () => {
    expect(getGenerationUserPrompt('דנה', 'female')).toContain('דנה');
  });

  it('contains core instruction text', () => {
    const prompt = getGenerationUserPrompt('עידן', 'male');
    expect(prompt).toContain('כתוב רק את גוף ברכת יום הולדת');
    expect(prompt).toContain('כתוב רק את גוף הברכה, בלי הסברים');
  });
});

describe('Mandatory validation and retry loop (runGenerationWithValidation)', () => {
  it('returns value when validator says yes on first attempt', async () => {
    const value = { message: 'מזל טוב! דנה שנה טובה 🎂', language: 'he' as const };
    const result = await runGenerationWithValidation(
      5,
      async () => value,
      async () => true
    );
    expect(result).toBe(value);
    expect(result.message).toBe(value.message);
  });

  it('retries when validator says no, returns when validator says yes', async () => {
    let attempt = 0;
    const results = [
      { message: 'attempt1', language: 'he' as const },
      { message: 'attempt2', language: 'he' as const },
      { message: 'attempt3', language: 'he' as const },
    ];
    const result = await runGenerationWithValidation(
      5,
      async () => results[attempt++],
      async (v) => v.message === 'attempt3'
    );
    expect(attempt).toBe(3);
    expect(result.message).toBe('attempt3');
  });

  it('throws BlessingValidationFailedError after 5 attempts when validator always says no', async () => {
    let attempts = 0;
    await expect(
      runGenerationWithValidation(
        MAX_VALIDATION_ATTEMPTS,
        async () => {
          attempts++;
          return { message: `attempt${attempts}`, language: 'he' as const };
        },
        async () => false
      )
    ).rejects.toThrow(BlessingValidationFailedError);

    expect(attempts).toBe(5);
  });

  it('BlessingValidationFailedError has correct name and attempts', async () => {
    try {
      await runGenerationWithValidation(
        5,
        async () => ({ message: 'x', language: 'he' as const }),
        async () => false
      );
    } catch (e) {
      expect(e).toBeInstanceOf(BlessingValidationFailedError);
      expect((e as BlessingValidationFailedError).name).toBe('BlessingValidationFailedError');
      expect((e as BlessingValidationFailedError).attempts).toBe(5);
      expect((e as Error).message).toContain('5 attempts');
    }
  });

  it('does not send unvalidated message: only returns when validate returns true', async () => {
    const onlyValidMessage = { message: 'מזל טוב! עידן רק זה עובר 🎂', language: 'he' as const };
    const result = await runGenerationWithValidation(
      5,
      async () => onlyValidMessage,
      async (v) => v.message.includes('רק זה עובר')
    );
    expect(result).toBe(onlyValidMessage);
  });
});
