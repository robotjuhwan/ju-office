import { describe, expect, it } from 'vitest';

import { computeIsStale } from '../../web/app.js';

describe('stale badge logic', () => {
  it('marks snapshot stale when older than 300 seconds', () => {
    const oldSnapshot = {
      generatedAt: new Date(Date.now() - 301_000).toISOString(),
      staleAfterSec: 300,
      runSummary: { runId: 'r', goal: 'g', status: 'executing', metrics: { tasksTotal: 0, tasksDone: 0, proofsVerified: 0 } },
      orgView: [],
      taskBoard: [],
      commandFeed: [],
      artifactPanel: []
    };

    const freshSnapshot = {
      ...oldSnapshot,
      generatedAt: new Date().toISOString()
    };

    expect(computeIsStale(oldSnapshot)).toBe(true);
    expect(computeIsStale(freshSnapshot)).toBe(false);
  });
});
