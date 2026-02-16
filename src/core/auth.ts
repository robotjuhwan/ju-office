import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { readJsonFile } from '../utils/fs.js';
import { JuCliError } from './error-codes.js';

const MAX_PROOF_BYTES = 20 * 1024 * 1024;
const DEFAULT_PROOF_TIMEOUT_MS = 5_000;

const authConfigSchema = z.object({
  mutatingActors: z.record(z.string().min(1), z.array(z.string().min(1))),
  actorTokens: z.record(z.string().min(1), z.string().min(1)).default({}),
  actorTokenEnv: z
    .record(
      z.string().min(1),
      z
        .string()
        .min(1)
        .regex(/^[A-Z_][A-Z0-9_]*$/, 'Environment variable names must be uppercase snake_case')
    )
    .default({}),
  readOnlyOpen: z.boolean(),
  rateLimitsPerHour: z.object({
    defaultMutating: z.number().int().positive(),
    stop: z.number().int().positive()
  }),
  proofPolicy: z
    .object({
      httpsAllowlist: z.array(z.string().min(1)).default([]),
      fetchTimeoutMs: z.number().int().positive().max(60_000).default(DEFAULT_PROOF_TIMEOUT_MS),
      maxBytes: z.number().int().positive().max(MAX_PROOF_BYTES).default(MAX_PROOF_BYTES)
    })
    .default({
      httpsAllowlist: [],
      fetchTimeoutMs: DEFAULT_PROOF_TIMEOUT_MS,
      maxBytes: MAX_PROOF_BYTES
    })
});

function toTokenBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

function resolveExpectedToken(config: AuthConfig, actor: string): string | null {
  const envVarName = config.actorTokenEnv[actor];
  if (envVarName) {
    const fromEnv = process.env[envVarName];
    if (typeof fromEnv === 'string' && fromEnv.length > 0) {
      return fromEnv;
    }
  }

  const fromConfig = config.actorTokens[actor];
  if (typeof fromConfig === 'string' && fromConfig.length > 0) {
    return fromConfig;
  }

  return null;
}

export interface AuthConfig {
  mutatingActors: Record<string, string[]>;
  actorTokens: Record<string, string>;
  actorTokenEnv: Record<string, string>;
  readOnlyOpen: boolean;
  rateLimitsPerHour: {
    defaultMutating: number;
    stop: number;
  };
  proofPolicy: {
    httpsAllowlist: string[];
    fetchTimeoutMs: number;
    maxBytes: number;
  };
}

export interface ProofValidationPolicy {
  artifactsDir: string;
  httpsAllowlist: string[];
  fetchTimeoutMs: number;
  maxBytes: number;
}

export async function loadAuthConfig(filePath: string): Promise<AuthConfig> {
  const raw = await readJsonFile<unknown>(filePath);
  const parsed = authConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new JuCliError(
      'E_CONTRACT_VALIDATION',
      `Invalid auth config: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
    );
  }

  for (const actor of Object.keys(parsed.data.mutatingActors)) {
    const hasInlineToken = Boolean(parsed.data.actorTokens[actor]);
    const hasEnvToken = Boolean(parsed.data.actorTokenEnv[actor]);
    if (!hasInlineToken && !hasEnvToken) {
      throw new JuCliError(
        'E_CONTRACT_VALIDATION',
        `Invalid auth config: token source is missing for actor ${actor}`
      );
    }
  }

  return parsed.data;
}

export function isActorAuthorized(config: AuthConfig, actor: string, command: string): boolean {
  const commands = config.mutatingActors[actor] ?? [];
  return commands.includes(command);
}

export function isStatusOpen(config: AuthConfig): boolean {
  return config.readOnlyOpen;
}

export function isAuthTokenValid(config: AuthConfig, actor: string, token: string): boolean {
  const expected = resolveExpectedToken(config, actor);
  if (!expected) {
    return false;
  }

  const expectedBuffer = toTokenBuffer(expected);
  const tokenBuffer = toTokenBuffer(token);
  if (expectedBuffer.length !== tokenBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, tokenBuffer);
}

export function canActorReadStatus(config: AuthConfig, actor: string): boolean {
  return Boolean(resolveExpectedToken(config, actor));
}

export function resolvePerHourLimit(config: AuthConfig, command: string): number {
  if (command === 'stop') {
    return config.rateLimitsPerHour.stop;
  }
  return config.rateLimitsPerHour.defaultMutating;
}

export function resolveProofValidationPolicy(config: AuthConfig, rootDir: string): ProofValidationPolicy {
  return {
    artifactsDir: path.resolve(rootDir, 'artifacts'),
    httpsAllowlist: config.proofPolicy.httpsAllowlist.map((host) => host.toLowerCase()),
    fetchTimeoutMs: config.proofPolicy.fetchTimeoutMs,
    maxBytes: Math.min(config.proofPolicy.maxBytes, MAX_PROOF_BYTES)
  };
}
