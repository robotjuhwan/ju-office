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
      orgView: [
        {
          personaId: 'ceo-001',
          role: 'CEO',
          assignmentCount: 1,
          objective: 'Lead deterministic execution',
          character: {
            avatar: '👑',
            style: 'executive',
            accentColor: '#8b5cf6'
          },
          coordinates: {
            xPct: 14,
            yPct: 18,
            zone: 'Executive Suite',
            room: 'Strategy Desk'
          }
        }
      ],
      taskBoard: [],
      commandFeed: [],
      artifactPanel: []
    });

    expect(parsed.staleAfterSec).toBe(300);
    expect(parsed.orgView[0]?.coordinates.xPct).toBe(14);
  });
});
