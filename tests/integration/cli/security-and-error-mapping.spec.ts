import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../src/artifacts/hash.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

interface AuthConfigShape {
  mutatingActors: Record<string, string[]>;
  actorTokens?: Record<string, string>;
  actorTokenEnv?: Record<string, string>;
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

async function updateAuthConfig(
  rootDir: string,
  updater: (current: AuthConfigShape) => AuthConfigShape
): Promise<void> {
  const file = path.join(rootDir, 'config', 'auth.json');
  const current = JSON.parse(await fs.readFile(file, 'utf8')) as AuthConfigShape;
  const next = updater(current);
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

describe('security and error mapping', () => {
  it('rejects disallowed startup goals', async () => {
    const ws = await createTestWorkspace();
    try {
      const result = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch phishing automation and malware campaign',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-disallowed-goal-1'
      ]);

      expect(result.exitCode).toBe(3);
      expect((result.stderr as any).error.code).toBe('E_CONTRACT_VALIDATION');
    } finally {
      await ws.cleanup();
    }
  });

  it('maps idempotency conflict to E_IDEMPOTENCY_CONFLICT', async () => {
    const ws = await createTestWorkspace();
    try {
      const first = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch deterministic idempotency behavior checks for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'same-key'
      ]);
      expect(first.exitCode).toBe(0);

      const conflict = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Different payload should trigger idempotency conflict',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'same-key'
      ]);
      expect(conflict.exitCode).toBe(6);
      expect((conflict.stderr as any).error.code).toBe('E_IDEMPOTENCY_CONFLICT');
    } finally {
      await ws.cleanup();
    }
  });

  it('maps invalid pause/resume transitions to E_INVALID_TRANSITION', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch pause and resume edge-case validation flow for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-transition-1'
      ]);

      const pause = await runCliCommand(ws.rootDir, [
        'pause',
        '--reason',
        'Pause once',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'pause-transition-1'
      ]);
      expect(pause.exitCode).toBe(0);

      const pauseAgain = await runCliCommand(ws.rootDir, [
        'pause',
        '--reason',
        'Pause twice should be invalid',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'pause-transition-2'
      ]);
      expect(pauseAgain.exitCode).toBe(7);
      expect((pauseAgain.stderr as any).error.code).toBe('E_INVALID_TRANSITION');

      const resume = await runCliCommand(ws.rootDir, [
        'resume',
        '--reason',
        'Resume once',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'resume-transition-1'
      ]);
      expect(resume.exitCode).toBe(0);

      const resumeAgain = await runCliCommand(ws.rootDir, [
        'resume',
        '--reason',
        'Resume twice should be invalid',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'resume-transition-2'
      ]);
      expect(resumeAgain.exitCode).toBe(7);
      expect((resumeAgain.stderr as any).error.code).toBe('E_INVALID_TRANSITION');
    } finally {
      await ws.cleanup();
    }
  });

  it('maps rate-limit storage read failures to E_STORAGE_IO', async () => {
    const ws = await createTestWorkspace();
    try {
      await fs.mkdir(path.join(ws.rootDir, 'data', 'rate-limits.json'), { recursive: true });
      const result = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch storage mapping test for rate limiter',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-rate-storage-1'
      ]);

      expect(result.exitCode).toBe(9);
      expect((result.stderr as any).error.code).toBe('E_STORAGE_IO');
    } finally {
      await ws.cleanup();
    }
  });

  it('enforces auth token on mutating commands', async () => {
    const ws = await createTestWorkspace();
    try {
      const result = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch actor impersonation mitigation test for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'wrong-token',
        '--idempotency-key',
        'start-bad-token-1'
      ]);

      expect(result.exitCode).toBe(4);
      expect((result.stderr as any).error.code).toBe('E_UNAUTHORIZED_ACTOR');
    } finally {
      await ws.cleanup();
    }
  });

  it('rate-limits repeated auth failures without consuming successful command quota', async () => {
    const ws = await createTestWorkspace();
    try {
      for (let i = 0; i < 12; i += 1) {
        const failed = await runCliCommand(ws.rootDir, [
          'start',
          '--goal',
          'Launch auth failure throttling test for Ju Office',
          '--actor',
          'investor-1',
          '--auth-token',
          'wrong-token',
          '--idempotency-key',
          `start-auth-fail-${i}`
        ]);
        expect(failed.exitCode).toBe(4);
      }

      const throttled = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch auth failure throttling test for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'wrong-token',
        '--idempotency-key',
        'start-auth-fail-throttled'
      ]);
      expect(throttled.exitCode).toBe(5);
      expect((throttled.stderr as any).error.code).toBe('E_RATE_LIMIT_EXCEEDED');

      const valid = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch valid start after failed auth attempts',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-after-failed-auth'
      ]);

      expect(valid.exitCode).toBe(0);
    } finally {
      await ws.cleanup();
    }
  });

  it('enforces readOnlyOpen status policy when set to false', async () => {
    const ws = await createTestWorkspace();
    try {
      await updateAuthConfig(ws.rootDir, (current) => ({
        ...current,
        readOnlyOpen: false
      }));

      const denied = await runCliCommand(ws.rootDir, ['status']);
      expect(denied.exitCode).toBe(4);
      expect((denied.stderr as any).error.code).toBe('E_UNAUTHORIZED_ACTOR');

      const allowed = await runCliCommand(ws.rootDir, [
        'status',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1'
      ]);
      expect(allowed.exitCode).toBe(0);
    } finally {
      await ws.cleanup();
    }
  });

  it('rejects file proof URIs outside repository artifacts directory', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch proof policy enforcement regression tests for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-proof-policy-1'
      ]);

      const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-outside-artifacts-'));
      const outsidePath = path.join(outsideDir, 'outside.txt');
      const content = Buffer.from('outside artifacts test');
      await fs.writeFile(outsidePath, content);

      const result = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Attempt completion with outside file proof',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${outsidePath}`,
        '--proof-sha256',
        sha256Hex(content),
        '--complete-task',
        '--actor',
        'ceo-001',
        '--auth-token',
        'token-ceo-001',
        '--idempotency-key',
        'proof-outside-1'
      ]);

      expect(result.exitCode).toBe(10);
      expect((result.stderr as any).error.code).toBe('E_ARTIFACT_VERIFICATION_FAILED');
      expect((result.stderr as any).error.details.reasonCode).toBe('E_FILE_OUTSIDE_ARTIFACTS');

      await fs.rm(outsideDir, { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('requires complete-task permission separate from message permission', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch complete-task authorization checks for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-complete-perm-1'
      ]);

      const artifactDir = path.join(ws.rootDir, 'artifacts', 'security-complete-task');
      await fs.mkdir(artifactDir, { recursive: true });
      const artifactPath = path.join(artifactDir, 'proof.txt');
      const content = Buffer.from('complete-task permission proof');
      await fs.writeFile(artifactPath, content);

      const denied = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Attempt completion without complete-task permission',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${artifactPath}`,
        '--proof-sha256',
        sha256Hex(content),
        '--complete-task',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'complete-perm-denied-1'
      ]);

      expect(denied.exitCode).toBe(4);
      expect((denied.stderr as any).error.code).toBe('E_UNAUTHORIZED_ACTOR');

      await fs.rm(artifactDir, { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('rejects proof validation when artifacts root is a symlink', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch symlink-root proof validation checks for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-symlink-root-1'
      ]);

      const externalArtifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-external-artifacts-'));
      const externalProofPath = path.join(externalArtifactsDir, 'proof.txt');
      const content = Buffer.from('proof from external symlinked artifacts root');
      await fs.writeFile(externalProofPath, content);

      const workspaceArtifactsPath = path.join(ws.rootDir, 'artifacts');
      await fs.rm(workspaceArtifactsPath, { recursive: true, force: true });
      await fs.symlink(externalArtifactsDir, workspaceArtifactsPath);

      const result = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Attempt completion with symlinked artifacts root',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${path.join(workspaceArtifactsPath, 'proof.txt')}`,
        '--proof-sha256',
        sha256Hex(content),
        '--complete-task',
        '--actor',
        'ceo-001',
        '--auth-token',
        'token-ceo-001',
        '--idempotency-key',
        'proof-symlink-root-1'
      ]);

      expect(result.exitCode).toBe(10);
      expect((result.stderr as any).error.code).toBe('E_ARTIFACT_VERIFICATION_FAILED');
      expect((result.stderr as any).error.details.reasonCode).toBe('E_FILE_OUTSIDE_ARTIFACTS');

      await fs.rm(externalArtifactsDir, { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('enforces max run duration budget on mutating commands', async () => {
    const ws = await createTestWorkspace();
    try {
      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch run duration guardrail checks for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-duration-budget-1'
      ]);
      expect(start.exitCode).toBe(0);

      const runId = (start.stdout as any).data.runId as string;
      const runFile = path.join(ws.rootDir, 'data', 'runs', runId, 'run.json');
      const run = JSON.parse(await fs.readFile(runFile, 'utf8')) as Record<string, any>;
      run.createdAt = new Date(Date.now() - 241 * 60 * 1000).toISOString();
      await fs.writeFile(runFile, `${JSON.stringify(run, null, 2)}\n`, 'utf8');

      const blocked = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'This command should fail after run duration budget is exceeded',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'duration-budget-message-1'
      ]);

      expect(blocked.exitCode).toBe(7);
      expect((blocked.stderr as any).error.code).toBe('E_INVALID_TRANSITION');
    } finally {
      await ws.cleanup();
    }
  });
});
