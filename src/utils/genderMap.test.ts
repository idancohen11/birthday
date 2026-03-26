import { describe, it, expect } from 'vitest';
import { resolveGender } from './genderMap.js';

describe('resolveGender', () => {
  it('returns female for known female names', () => {
    expect(resolveGender('דנה')).toBe('female');
    expect(resolveGender('לילך')).toBe('female');
    expect(resolveGender('ענת')).toBe('female');
  });

  it('returns male for known male names', () => {
    expect(resolveGender('עידן')).toBe('male');
    expect(resolveGender('דניאל')).toBe('male');
    expect(resolveGender('תומר')).toBe('male');
  });

  it('returns neutral for ambiguous names', () => {
    expect(resolveGender('אור')).toBe('neutral');
    expect(resolveGender('טל')).toBe('neutral');
    expect(resolveGender('לידור')).toBe('neutral');
  });

  it('returns neutral for unknown names', () => {
    expect(resolveGender('שלמה')).toBe('neutral');
    expect(resolveGender('unknown')).toBe('neutral');
  });

  it('returns neutral for generic fallback names', () => {
    expect(resolveGender('נשמה')).toBe('neutral');
    expect(resolveGender('חבר/ה')).toBe('neutral');
  });

  it('trims whitespace before lookup', () => {
    expect(resolveGender('  דנה  ')).toBe('female');
    expect(resolveGender(' עידן ')).toBe('male');
  });
});
