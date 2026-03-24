import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClassificationResult } from '../ai/types.js';

const sendMessageMock = vi.fn();
const classifyMessageMock = vi.fn<() => Promise<ClassificationResult>>();
const mightBeBirthdayMessageMock = vi.fn();
const generateBirthdayMessageMock = vi.fn();

vi.mock('../ai/index.js', () => ({
  classifyMessage: (...args: unknown[]) => classifyMessageMock(...(args as [])),
  mightBeBirthdayMessage: (...args: unknown[]) => mightBeBirthdayMessageMock(...(args as [])),
  generateBirthdayMessage: (...args: unknown[]) => generateBirthdayMessageMock(...(args as [])),
  replaceNamePlaceholder: (t: string) => t,
  BlessingValidationFailedError: class extends Error {
    constructor(public attempts: number) {
      super(`failed after ${attempts} attempts`);
      this.name = 'BlessingValidationFailedError';
    }
  },
}));

vi.mock('./client.js', () => ({
  getSocket: vi.fn(() => ({ sendMessage: sendMessageMock })),
}));

// Each test uses a unique group ID to avoid wish-count interference (includes timestamp for cross-run isolation)
const testRunId = Date.now();
let testGroupId = `group-${testRunId}-0@g.us`;
let testCounter = 0;

vi.mock('../config.js', () => ({
  config: {
    openaiApiKey: 'test-key',
    generationModel: 'gpt-4o-mini',
    classificationModel: 'gpt-4o-mini',
    dryRun: true,
    responseDelayMin: 0,
    responseDelayMax: 0,
    get targetGroupId() { return testGroupId; },
    confidenceThreshold: 0.8,
  },
}));

vi.mock('../utils/delay.js', () => ({
  randomDelay: vi.fn(() => Promise.resolve()),
}));

function makeMessage(text: string) {
  return {
    key: { remoteJid: testGroupId, fromMe: false },
    message: { conversation: text },
  };
}

describe('handleMessage – name extraction with regex fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testCounter++;
    testGroupId = `group-${testRunId}-${testCounter}@g.us`;
    generateBirthdayMessageMock.mockResolvedValue({
      message: 'מזל טוב! דנה test 🎂\n\nגילוי נאות: ...',
      language: 'he',
    });
  });

  it('uses regex fallback when classifier returns no name but message has "מזל טוב [name]"', async () => {
    mightBeBirthdayMessageMock.mockReturnValue(true);
    classifyMessageMock.mockResolvedValue({
      isBirthday: true,
      isInitialWish: true,
      birthdayPersonName: null, // AI missed the name
      confidence: 0.95,
      reasoning: 'test',
    });

    const { handleMessage } = await import('./handler.js');
    await handleMessage(makeMessage('מזל טוב דנה! 🎂') as any);

    // Should have called generate with the regex-extracted name "דנה"
    expect(generateBirthdayMessageMock).toHaveBeenCalledWith(
      'דנה',
      expect.any(String),
      expect.any(String),
    );
  });

  it('uses regex fallback when classifier returns generic term but message has real name', async () => {
    mightBeBirthdayMessageMock.mockReturnValue(true);
    classifyMessageMock.mockResolvedValue({
      isBirthday: true,
      isInitialWish: true,
      birthdayPersonName: 'נשמה', // AI returned a generic term
      confidence: 0.95,
      reasoning: 'test',
    });

    const { handleMessage } = await import('./handler.js');
    await handleMessage(makeMessage('מזל טוב לשרה! יום הולדת שמח') as any);

    expect(generateBirthdayMessageMock).toHaveBeenCalledWith(
      'שרה',
      expect.any(String),
      expect.any(String),
    );
  });

  it('uses regex fallback for "יום הולדת שמח ל[name]" patterns', async () => {
    mightBeBirthdayMessageMock.mockReturnValue(true);
    classifyMessageMock.mockResolvedValue({
      isBirthday: true,
      isInitialWish: true,
      birthdayPersonName: null,
      confidence: 0.9,
      reasoning: 'test',
    });

    const { handleMessage } = await import('./handler.js');
    await handleMessage(makeMessage('יום הולדת שמח ליוסי! 🎉') as any);

    expect(generateBirthdayMessageMock).toHaveBeenCalledWith(
      'יוסי',
      expect.any(String),
      expect.any(String),
    );
  });

  it('sets pending birthday when neither classifier nor regex finds a name', async () => {
    mightBeBirthdayMessageMock.mockReturnValue(true);
    classifyMessageMock.mockResolvedValue({
      isBirthday: true,
      isInitialWish: true,
      birthdayPersonName: null,
      confidence: 0.9,
      reasoning: 'test',
    });

    const { handleMessage } = await import('./handler.js');
    // Message with no name pattern at all
    await handleMessage(makeMessage('יום הולדת שמח! 🎂🎉') as any);

    // Should NOT have called generate (no name found, set pending instead)
    expect(generateBirthdayMessageMock).not.toHaveBeenCalled();
  });
});