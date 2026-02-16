import { access } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { initStorage } from '../../../src/store/init-storage.js';
import { resolvePaths } from '../../../src/store/paths.js';
import { createTestWorkspace } from '../../helpers/test-env.js';

describe('storage bootstrap', () => {
  it('creates deterministic storage layout', async () => {
    const ws = await createTestWorkspace();
    try {
      const paths = resolvePaths(ws.rootDir);
      await initStorage(paths);

      await access(path.join(ws.rootDir, 'data', 'runs', 'index.json'));
      await access(path.join(ws.rootDir, 'data', 'locks'));
      await access(path.join(ws.rootDir, 'data', 'snapshot'));

      const indexExists = await access(path.join(ws.rootDir, 'data', 'runs', 'index.json')).then(
        () => true,
        () => false
      );
      expect(indexExists).toBe(true);
    } finally {
      await ws.cleanup();
    }
  });
});
