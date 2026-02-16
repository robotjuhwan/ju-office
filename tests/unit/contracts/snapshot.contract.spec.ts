import { describe, expect, it } from 'vitest';

import { snapshotSchema } from '../../../src/contracts/snapshot.contract.js';

describe('snapshot contract', () => {
  it('validates snapshot structure', () => {
    const parsed = snapshotSchema.parse({
      generatedAt: new Date().toISOString(),
      staleAfterSec: 300,
      runSummary: {
        runId: 'run_20260216T093000Z_ab12cd',
        goal: 'Goal text here',
        status: 'executing',
        metrics: { tasksTotal: 4, tasksDone: 1, proofsVerified: 1 }
      },
      orgView: [],
      taskBoard: [],
      commandFeed: [],
      artifactPanel: []
    });

    expect(parsed.staleAfterSec).toBe(300);
  });
});
