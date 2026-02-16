import { describe, expect, it } from 'vitest';

import { runSchema } from '../../../src/contracts/run.contract.js';

describe('run contract', () => {
  it('accepts valid run object', () => {
    const parsed = runSchema.parse({
      runId: 'run_20260216T093000Z_ab12cd',
      goal: 'Launch an MVP with deterministic execution and proof gating',
      status: 'executing',
      personas: [
        { id: 'ceo-001', role: 'CEO', model: 'm', specialty: 's', objective: 'o' },
        { id: 'cto-001', role: 'CTO', model: 'm', specialty: 's', objective: 'o' },
        { id: 'pm-001', role: 'PM', model: 'm', specialty: 's', objective: 'o' },
        { id: 'eng-001', role: 'ENG', model: 'm', specialty: 's', objective: 'o' },
        { id: 'ops-001', role: 'OPS', model: 'm', specialty: 's', objective: 'o' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metrics: { tasksTotal: 4, tasksDone: 0, proofsVerified: 0 }
    });

    expect(parsed.status).toBe('executing');
  });

  it('accepts run object with autopilot metadata', () => {
    const parsed = runSchema.parse({
      runId: 'run_20260216T093000Z_ab12cd',
      goal: 'Launch an MVP with deterministic execution and proof gating',
      status: 'verifying',
      personas: [
        { id: 'ceo-001', role: 'CEO', model: 'm', specialty: 's', objective: 'o' },
        { id: 'cto-001', role: 'CTO', model: 'm', specialty: 's', objective: 'o' },
        { id: 'pm-001', role: 'PM', model: 'm', specialty: 's', objective: 'o' },
        { id: 'eng-001', role: 'ENG', model: 'm', specialty: 's', objective: 'o' },
        { id: 'ops-001', role: 'OPS', model: 'm', specialty: 's', objective: 'o' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metrics: { tasksTotal: 4, tasksDone: 4, proofsVerified: 4 },
      autopilot: {
        phase: 'validation',
        state: 'awaiting_review',
        qa: {
          result: 'pass',
          cyclesCompleted: 1,
          maxCycles: 5,
          repeatedFailureCount: 0,
          summary: 'QA passed',
          actor: 'investor-1',
          updatedAt: new Date().toISOString()
        },
        validation: {
          roundsCompleted: 0,
          maxRounds: 3
        },
        reviews: {
          architect: {
            decision: 'approve',
            summary: 'approved',
            actor: 'investor-1',
            updatedAt: new Date().toISOString()
          },
          security: { decision: 'pending' },
          code: { decision: 'pending' }
        },
        planFiles: {
          spec: '.omx/plans/autopilot-spec.md',
          implementation: '.omx/plans/autopilot-impl.md',
          checklist: '.omx/plans/autopilot-checklist.md'
        },
        updatedAt: new Date().toISOString()
      }
    });

    expect(parsed.autopilot?.qa.result).toBe('pass');
  });
});
