import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { processCommandFromArgv } from '../../src/core/command-processor.js';
import { exitCodeByError, normalizeError, toErrorPayload } from '../../src/core/error-codes.js';

export const TEST_INVESTOR_TOKEN = 'token-investor-1';
export const TEST_CEO_TOKEN = 'token-ceo-001';
export const TEST_ARCHITECT_TOKEN = 'token-architect-001';
export const TEST_SECURITY_TOKEN = 'token-security-001';
export const TEST_CODE_TOKEN = 'token-code-001';

async function copyIfExists(source: string, target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

export async function createTestWorkspace(): Promise<{ rootDir: string; cleanup: () => Promise<void> }> {
  process.env.JU_ACTOR_TOKEN_INVESTOR_1 ??= TEST_INVESTOR_TOKEN;
  process.env.JU_ACTOR_TOKEN_CEO_001 ??= TEST_CEO_TOKEN;
  process.env.JU_ACTOR_TOKEN_ARCHITECT_001 ??= TEST_ARCHITECT_TOKEN;
  process.env.JU_ACTOR_TOKEN_SECURITY_001 ??= TEST_SECURITY_TOKEN;
  process.env.JU_ACTOR_TOKEN_CODE_001 ??= TEST_CODE_TOKEN;

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-office-test-'));
  const repoRoot = process.cwd();

  await copyIfExists(path.join(repoRoot, 'config'), path.join(rootDir, 'config'));
  await copyIfExists(path.join(repoRoot, 'artifacts'), path.join(rootDir, 'artifacts'));
  await copyIfExists(path.join(repoRoot, 'docs', 'contracts'), path.join(rootDir, 'docs', 'contracts'));
  await copyIfExists(path.join(repoRoot, 'docs', 'mvp-scope.md'), path.join(rootDir, 'docs', 'mvp-scope.md'));
  await copyIfExists(path.join(repoRoot, 'web'), path.join(rootDir, 'web'));
  await fs.mkdir(path.join(rootDir, '.github', 'workflows'), { recursive: true });
  await copyIfExists(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), path.join(rootDir, '.github', 'workflows', 'ci.yml'));
  await copyIfExists(path.join(repoRoot, '.github', 'workflows', 'pages.yml'), path.join(rootDir, '.github', 'workflows', 'pages.yml'));

  return {
    rootDir,
    cleanup: async () => {
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  };
}

export interface CommandResult {
  exitCode: number;
  stdout?: unknown;
  stderr?: unknown;
}

export async function runCliCommand(rootDir: string, argv: string[]): Promise<CommandResult> {
  try {
    const response = await processCommandFromArgv(argv, rootDir);
    return { exitCode: 0, stdout: response };
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      exitCode: exitCodeByError[normalized.code],
      stderr: toErrorPayload(normalized)
    };
  }
}
