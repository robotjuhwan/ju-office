import { access, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBuildDocs } from '../../../scripts/build-docs.js';
import { runBuildSnapshot } from '../../../scripts/build-snapshot.js';
import { runBuildWeb } from '../../../scripts/build-web.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('scripts smoke', () => {
  it('runs snapshot/web/docs build scripts', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch deterministic office MVP for investor review',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-smoke-1'
      ]);

      await runBuildSnapshot(ws.rootDir);
      await runBuildWeb(ws.rootDir);
      await runBuildDocs(ws.rootDir);

      await access(path.join(ws.rootDir, 'data', 'snapshot', 'latest.json'));
      const appStat = await stat(path.join(ws.rootDir, 'docs', 'assets', 'app.js'));
      expect(appStat.size).toBeGreaterThan(0);
    } finally {
      await ws.cleanup();
    }
  });
});
