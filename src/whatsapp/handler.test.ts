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
