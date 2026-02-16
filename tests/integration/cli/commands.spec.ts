import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../src/artifacts/hash.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('cli commands integration', () => {
  it('supports full command set with deterministic payloads', async () => {
    const ws = await createTestWorkspace();
    try {
      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch AI bookkeeping SaaS MVP with investor visibility',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-001'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;

      const status = await runCliCommand(ws.rootDir, [
        'status',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1'
      ]);
      expect(status.exitCode).toBe(0);
      expect((status.stdout as any).data.run.runId).toBe(runId);

      const pause = await runCliCommand(ws.rootDir, [
        'pause',
        '--reason',
        'Need investor approval on pricing',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'pause-001'
      ]);
      expect(pause.exitCode).toBe(0);
      expect((pause.stdout as any).data.status).toBe('paused');

      const resume = await runCliCommand(ws.rootDir, [
        'resume',
        '--reason',
        'Approval received and execution can continue',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'resume-001'
      ]);
      expect(resume.exitCode).toBe(0);
      expect((resume.stdout as any).data.status).toBe('executing');

      const reprio = await runCliCommand(ws.rootDir, [
        'reprioritize',
        '--task-id',
        'TASK-001',
        '--priority',
        'P0',
        '--reason',
        'Revenue risk is highest priority',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'reprio-001'
      ]);
      expect(reprio.exitCode).toBe(0);
      expect((reprio.stdout as any).data).toEqual({ taskId: 'TASK-001', priority: 'P0' });

      const message = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Ship demo today',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'msg-001'
      ]);
      expect(message.exitCode).toBe(0);
      expect((message.stdout as any).data.eventId).toBeTypeOf('string');

      const artifactDir = path.join(ws.rootDir, 'artifacts', 'integration-cli');
      await fs.mkdir(artifactDir, { recursive: true });
      const artifactPath = path.join(artifactDir, 'demo.txt');
      const content = Buffer.from('demo output');
      await fs.writeFile(artifactPath, content);
      const hash = sha256Hex(content);

      const complete = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Demo uploaded',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${artifactPath}`,
        '--proof-sha256',
        hash,
        '--complete-task',
        '--actor',
        'ceo-001',
        '--auth-token',
        'token-ceo-001',
        '--idempotency-key',
        'proof-001'
      ]);
      expect(complete.exitCode).toBe(0);
      expect((complete.stdout as any).data.taskUpdate.status).toBe('done');

      const stop = await runCliCommand(ws.rootDir, [
        'stop',
        '--reason',
        'End of MVP run window',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'stop-001'
      ]);
      expect(stop.exitCode).toBe(0);
      expect((stop.stdout as any).data.status).toBe('stopped');

      await fs.rm(artifactDir, { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });
});
