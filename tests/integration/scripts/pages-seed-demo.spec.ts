import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { snapshotSchema } from '../../../src/contracts/snapshot.contract.js';
import { runSeedPagesDemo } from '../../../scripts/seed-pages-demo.js';
import { createTestWorkspace } from '../../helpers/test-env.js';

describe('pages demo seed script', () => {
  it('creates a seeded run with one completed task backed by a verified local proof', async () => {
    const ws = await createTestWorkspace();
    try {
      const seeded = await runSeedPagesDemo(ws.rootDir);
      expect(seeded.runId.startsWith('run_')).toBe(true);
      expect(seeded.taskId.startsWith('TASK-')).toBe(true);
      expect(seeded.proofUri.startsWith('file://')).toBe(true);

      const snapshotPath = path.join(ws.rootDir, 'data', 'snapshot', 'latest.json');
      const snapshotRaw = await readFile(snapshotPath, 'utf8');
      const snapshot = snapshotSchema.parse(JSON.parse(snapshotRaw) as unknown);

      expect(snapshot.runSummary.runId).toBe(seeded.runId);
      expect(snapshot.runSummary.metrics.tasksDone).toBeGreaterThanOrEqual(1);
      expect(snapshot.runSummary.metrics.proofsVerified).toBeGreaterThanOrEqual(1);
      expect(snapshot.taskBoard.some((task) => task.taskId === seeded.taskId && task.status === 'done')).toBe(true);
      expect(
        snapshot.artifactPanel.some(
          (artifact) => artifact.taskId === seeded.taskId && artifact.status === 'verified' && artifact.uri === seeded.proofUri
        )
      ).toBe(true);
    } finally {
      await ws.cleanup();
    }
  });
});
