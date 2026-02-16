import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createTestWorkspace } from '../../helpers/test-env.js';

describe('ci required jobs', () => {
  it('contains required workflow jobs from plan', async () => {
    const ws = await createTestWorkspace();
    try {
      const ci = await readFile(path.join(ws.rootDir, '.github', 'workflows', 'ci.yml'), 'utf8');
      expect(ci).toContain('lint_typecheck:');
      expect(ci).toContain('unit:');
      expect(ci).toContain('integration:');
      expect(ci).toContain('ui:');
      expect(ci).toContain('build_docs:');

      const pages = await readFile(path.join(ws.rootDir, '.github', 'workflows', 'pages.yml'), 'utf8');
      expect(pages).toContain('pages_publish:');
      expect(pages).toContain('branches:');
      expect(pages).toContain('- main');
      expect(pages).toContain('npm run pages:seed-demo');

      const seedIndex = pages.indexOf('npm run pages:seed-demo');
      const snapshotIndex = pages.indexOf('npm run snapshot:build');
      expect(seedIndex).toBeGreaterThanOrEqual(0);
      expect(snapshotIndex).toBeGreaterThan(seedIndex);
    } finally {
      await ws.cleanup();
    }
  });
});
