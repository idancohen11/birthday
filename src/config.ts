import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  // OpenAI
  openaiApiKey: requireEnv('OPENAI_API_KEY'),
  
  // WhatsApp
  targetGroupId: process.env.TARGET_GROUP_ID || '', // Empty means log all groups for discovery
  
  // Behavior
  dryRun: optionalEnv('DRY_RUN', 'true') === 'true',
  responseDelayMin: parseInt(optionalEnv('RESPONSE_DELAY_MIN', '30000'), 10),
  responseDelayMax: parseInt(optionalEnv('RESPONSE_DELAY_MAX', '180000'), 10),
  
  // Logging
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  
  // AI Settings
  classificationModel: 'gpt-4o-mini',
  generationModel: 'gpt-4o-mini',
  confidenceThreshold: 0.8,
} as const;

export type Config = typeof config;

