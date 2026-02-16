import { describe, expect, it } from 'vitest';

import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('active run lock', () => {
  it('prevents starting a second active run', async () => {
    const ws = await createTestWorkspace();
    try {
      const first = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch first deterministic run for lock testing',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-lock-1'
      ]);
      expect(first.exitCode).toBe(0);

      const second = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Attempt second run while first is active',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-lock-2'
      ]);
      expect(second.exitCode).toBe(8);
      expect((second.stderr as any).error.code).toBe('E_ACTIVE_RUN_LOCK');
    } finally {
      await ws.cleanup();
    }
  });

  it('handles concurrent start attempts without storage races', async () => {
    const ws = await createTestWorkspace();
    try {
      const [first, second] = await Promise.all([
        runCliCommand(ws.rootDir, [
          'start',
          '--goal',
          'Launch concurrent lock run A for race validation',
          '--actor',
          'investor-1',
          '--auth-token',
          'token-investor-1',
          '--idempotency-key',
          'start-concurrent-a'
        ]),
        runCliCommand(ws.rootDir, [
          'start',
          '--goal',
          'Launch concurrent lock run B for race validation',
          '--actor',
          'investor-1',
          '--auth-token',
          'token-investor-1',
          '--idempotency-key',
          'start-concurrent-b'
        ])
      ]);

      const results = [first, second];
      const success = results.filter((result) => result.exitCode === 0);
      const lockRejected = results.filter((result) => result.exitCode === 8);

      expect(success).toHaveLength(1);
      expect(lockRejected).toHaveLength(1);
      expect((lockRejected[0]?.stderr as any).error.code).toBe('E_ACTIVE_RUN_LOCK');
    } finally {
      await ws.cleanup();
    }
  });
});
