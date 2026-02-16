import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolvePaths } from '../../../src/store/paths.js';
import { readRun } from '../../../src/store/run-store.js';
import { createTestWorkspace, runCliCommand, TEST_INVESTOR_TOKEN } from '../../helpers/test-env.js';

describe('easy commands integration', () => {
  it('setup writes local env file and autopilot starts with minimal flags', async () => {
    const ws = await createTestWorkspace();
    const originalInvestorToken = process.env.JU_ACTOR_TOKEN_INVESTOR_1;

    try {
      const setup = await runCliCommand(ws.rootDir, ['setup']);
      expect(setup.exitCode).toBe(0);
      expect((setup.stdout as any).data.envFile).toBe('.ju-office.env');

      await fs.access(path.join(ws.rootDir, '.ju-office.env'));

      delete process.env.JU_ACTOR_TOKEN_INVESTOR_1;

      const start = await runCliCommand(ws.rootDir, [
        'autopilot',
        '--goal',
        'Build web snake game MVP with keyboard controls, score, and restart loop'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;

      const run = await readRun(resolvePaths(ws.rootDir), runId);
      expect(run?.status).toBe('executing');
      expect(run?.autopilot?.phase).toBe('execution');
      expect(run?.autopilot?.state).toBe('active');

      const status = await runCliCommand(ws.rootDir, ['status']);
      expect(status.exitCode).toBe(0);
      expect((status.stdout as any).data.run.runId).toBe(runId);
    } finally {
      if (originalInvestorToken) {
        process.env.JU_ACTOR_TOKEN_INVESTOR_1 = originalInvestorToken;
      } else {
        delete process.env.JU_ACTOR_TOKEN_INVESTOR_1;
      }
      await ws.cleanup();
    }
  });

  it('autopilot returns clear token guidance when no token source exists', async () => {
    const ws = await createTestWorkspace();
    const originalInvestorToken = process.env.JU_ACTOR_TOKEN_INVESTOR_1;

    try {
      delete process.env.JU_ACTOR_TOKEN_INVESTOR_1;

      const start = await runCliCommand(ws.rootDir, [
        'autopilot',
        '--goal',
        'Build deterministic task plan for simple snake game'
      ]);

      expect(start.exitCode).toBe(4);
      expect((start.stderr as any).error.code).toBe('E_UNAUTHORIZED_ACTOR');
      expect((start.stderr as any).error.message).toContain('npm run ju -- setup');
    } finally {
      process.env.JU_ACTOR_TOKEN_INVESTOR_1 = originalInvestorToken ?? TEST_INVESTOR_TOKEN;
      await ws.cleanup();
    }
  });
});
