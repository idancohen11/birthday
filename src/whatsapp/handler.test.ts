import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessageMock = vi.fn();

vi.mock('../ai/index.js', () => {
  class BlessingValidationFailedError extends Error {
    constructor(public attempts: number) {
      super(`Birthday message failed validation after ${attempts} attempts`);
      this.name = 'BlessingValidationFailedError';
    }
  }
  return {
    classifyMessage: vi.fn(),
    mightBeBirthdayMessage: vi.fn(),
    generateBirthdayMessage: vi.fn().mockRejectedValue(new BlessingValidationFailedError(5)),
    replaceNamePlaceholder: (t: string) => t,
    BlessingValidationFailedError,
  };
});

vi.mock('./client.js', () => ({
  getSocket: vi.fn(() => ({ sendMessage: sendMessageMock })),
}));

vi.mock('../config.js', () => ({
  config: {
    openaiApiKey: 'test-key',
    generationModel: 'gpt-4o-mini',
    dryRun: false,
    responseDelayMin: 0,
    responseDelayMax: 0,
    targetGroupId: '',
  },
}));

vi.mock('../utils/delay.js', () => ({
  randomDelay: vi.fn(() => Promise.resolve()),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('sendBirthdayMessage – do not send when generation/validation fails', () => {
  beforeEach(() => {
    sendMessageMock.mockClear();
  });

  it('does not call socket.sendMessage when generateBirthdayMessage throws', async () => {
    const { sendBirthdayMessage } = await import('./handler.js');
    await sendBirthdayMessage('group-123', 'TestName');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe('handleMessage – regex fallback on initial birthday path', () => {
  it('uses regex-extracted name when classifier returns no name (instead of pending state)', async () => {
    vi.resetModules();

    const aiMod = await import('../ai/index.js');
    const configMod = await import('../config.js');

    vi.mocked(aiMod.mightBeBirthdayMessage).mockReturnValue(true);
    vi.mocked(aiMod.classifyMessage).mockResolvedValue({
      isBirthday: true,
      isInitialWish: true,
      confidence: 0.95,
      birthdayPersonName: null,
    } as any);
    const genMock = vi.mocked(aiMod.generateBirthdayMessage);
    genMock.mockClear();
    genMock.mockResolvedValue({
      message: 'מזל טוב! דנה test message\n\ndisclaimer',
    } as any);

    (configMod.config as any).targetGroupId = 'test-group@g.us';
    (configMod.config as any).confidenceThreshold = 0.8;

    const { handleMessage } = await import('./handler.js');

    await handleMessage({
      key: { remoteJid: 'test-group@g.us', fromMe: false },
      message: { conversation: 'מזל טוב לדנה!' },
    } as any);

    // Should call generateBirthdayMessage with regex-extracted "דנה" and resolved gender
    expect(genMock).toHaveBeenCalledWith('דנה', expect.anything(), expect.anything(), 'female');
  });
});

describe('sendBirthdayMessage passes gender to generator', () => {
  it('calls generateBirthdayMessage with resolved gender for known names', async () => {
    vi.resetModules();

    const aiMod = await import('../ai/index.js');
    const genMock = vi.mocked(aiMod.generateBirthdayMessage);
    genMock.mockClear();
    genMock.mockResolvedValue({
      message: 'מזל טוב! עידן test message\n\ndisclaimer',
    } as any);

    const { sendBirthdayMessage } = await import('./handler.js');
    await sendBirthdayMessage('group-123', 'עידן');

    expect(genMock).toHaveBeenCalledWith('עידן', expect.anything(), expect.anything(), 'male');
  });

  it('resolves neutral for unknown names', async () => {
    vi.resetModules();

    const aiMod = await import('../ai/index.js');
    const genMock = vi.mocked(aiMod.generateBirthdayMessage);
    genMock.mockClear();
    genMock.mockResolvedValue({
      message: 'מזל טוב נשמה! test message\n\ndisclaimer',
    } as any);

    const { sendBirthdayMessage } = await import('./handler.js');
    await sendBirthdayMessage('group-123', 'נשמה');

    expect(genMock).toHaveBeenCalledWith('נשמה', expect.anything(), expect.anything(), 'neutral');
  });
});
