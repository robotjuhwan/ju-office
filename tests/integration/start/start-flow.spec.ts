import { describe, expect, it } from 'vitest';

import { readRun } from '../../../src/store/run-store.js';
import { readTasks } from '../../../src/store/task-store.js';
import { resolvePaths } from '../../../src/store/paths.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('start flow', () => {
  it('creates deterministic org and executable task set', async () => {
    const ws = await createTestWorkspace();
    try {
      const result = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch AI SaaS demo with deterministic investor reporting',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-flow-1'
      ]);

      expect(result.exitCode).toBe(0);
      const runId = (result.stdout as any).data.runId as string;
      const paths = resolvePaths(ws.rootDir);
      const run = await readRun(paths, runId);
      const tasks = await readTasks(paths, runId);

      expect(run).not.toBeNull();
      expect(run?.personas.map((persona) => persona.id)).toEqual([
        'ceo-001',
        'cto-001',
        'pm-001',
        'eng-001',
        'ops-001'
      ]);
      expect(tasks.length).toBeGreaterThanOrEqual(4);
      expect(tasks.length).toBeLessThanOrEqual(20);
    } finally {
      await ws.cleanup();
    }
  });
});
