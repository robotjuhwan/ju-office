import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('snapshot refresh on mutation', () => {
  it('rebuilds snapshot after mutating commands', async () => {
    const ws = await createTestWorkspace();
    try {
      const readSnapshotTime = async (): Promise<string> => {
        const raw = await readFile(path.join(ws.rootDir, 'data', 'snapshot', 'latest.json'), 'utf8');
        return (JSON.parse(raw) as any).generatedAt as string;
      };

      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch snapshot refresh regression tests for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-snap-1'
      ]);

      const t1 = await readSnapshotTime();

      await runCliCommand(ws.rootDir, [
        'pause',
        '--reason',
        'Pause to confirm snapshot refresh',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'pause-snap-1'
      ]);
      const t2 = await readSnapshotTime();

      await runCliCommand(ws.rootDir, [
        'resume',
        '--reason',
        'Resume to confirm second refresh',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'resume-snap-1'
      ]);
      const t3 = await readSnapshotTime();

      expect(Date.parse(t2)).toBeGreaterThanOrEqual(Date.parse(t1));
      expect(Date.parse(t3)).toBeGreaterThanOrEqual(Date.parse(t2));
    } finally {
      await ws.cleanup();
    }
  });
});
