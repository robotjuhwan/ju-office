import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBuildDocs } from '../../../scripts/build-docs.js';
import { runValidateDocsArtifacts } from '../../../scripts/validate-docs-artifacts.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

describe('docs build outputs', () => {
  it('produces required pages artifacts and valid snapshot', async () => {
    const ws = await createTestWorkspace();
    try {
      await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch docs build validation path with deterministic output',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-docs-1'
      ]);

      await runBuildDocs(ws.rootDir);
      await runValidateDocsArtifacts(ws.rootDir);

      const index = await readFile(path.join(ws.rootDir, 'docs', 'index.html'), 'utf8');
      expect(index.includes('./assets/app.js')).toBe(true);
      const snapshot = JSON.parse(await readFile(path.join(ws.rootDir, 'docs', 'data', 'snapshot.json'), 'utf8')) as any;
      expect(snapshot.runSummary).toBeDefined();
    } finally {
      await ws.cleanup();
    }
  });
});
