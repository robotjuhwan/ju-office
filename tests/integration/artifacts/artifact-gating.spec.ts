import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readTasks } from '../../../src/store/task-store.js';
import { resolvePaths } from '../../../src/store/paths.js';
import { sha256Hex } from '../../../src/artifacts/hash.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('artifact gating', () => {
  it('requires verified proofs before task completion', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch deterministic artifact gating tests for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-gate-1'
      ]);

      const artifactDir = path.join(ws.rootDir, 'artifacts', 'integration-gate');
      await fs.mkdir(artifactDir, { recursive: true });
      const artifactPath = path.join(artifactDir, 'proof.txt');
      const content = Buffer.from('artifact-proof');
      await fs.writeFile(artifactPath, content);

      const failed = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Complete task with invalid hash',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${artifactPath}`,
        '--proof-sha256',
        '0'.repeat(64),
        '--complete-task',
        '--actor',
        'ceo-001',
        '--auth-token',
        'token-ceo-001',
        '--idempotency-key',
        'gate-fail-1'
      ]);

      expect(failed.exitCode).toBe(10);
      expect((failed.stderr as any).error.code).toBe('E_ARTIFACT_VERIFICATION_FAILED');

      const ok = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Complete task with verified proof',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${artifactPath}`,
        '--proof-sha256',
        sha256Hex(content),
        '--complete-task',
        '--actor',
        'ceo-001',
        '--auth-token',
        'token-ceo-001',
        '--idempotency-key',
        'gate-ok-1'
      ]);

      expect(ok.exitCode).toBe(0);
      expect((ok.stdout as any).data.taskUpdate.status).toBe('done');

      const runStatus = await runCliCommand(ws.rootDir, [
        'status',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1'
      ]);
      const runId = (runStatus.stdout as any).data.run.runId as string;
      const tasks = await readTasks(resolvePaths(ws.rootDir), runId);
      expect(tasks.find((task) => task.taskId === 'TASK-001')?.status).toBe('done');

      await fs.rm(artifactDir, { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });
});
