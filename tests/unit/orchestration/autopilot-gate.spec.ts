import { describe, expect, it } from 'vitest';

import { evaluateRunProgress } from '../../../src/orchestration/run-engine.js';
import type { Run } from '../../../src/types/run.js';
import type { Task } from '../../../src/types/task.js';

function buildBaseRun(): Run {
  const now = new Date().toISOString();
  return {
    runId: 'run_20260216T093000Z_ab12cd',
    goal: 'Launch deterministic autopilot lifecycle coverage',
    status: 'verifying',
    personas: [
      { id: 'ceo-001', role: 'CEO', model: 'm', specialty: 's', objective: 'o' },
      { id: 'cto-001', role: 'CTO', model: 'm', specialty: 's', objective: 'o' },
      { id: 'pm-001', role: 'PM', model: 'm', specialty: 's', objective: 'o' },
      { id: 'eng-001', role: 'ENG', model: 'm', specialty: 's', objective: 'o' },
      { id: 'ops-001', role: 'OPS', model: 'm', specialty: 's', objective: 'o' }
    ],
    createdAt: now,
    updatedAt: now,
    metrics: {
      tasksTotal: 1,
      tasksDone: 1,
      proofsVerified: 1
    }
  };
}

function buildDoneTask(): Task[] {
  const now = new Date().toISOString();
  return [
    {
      taskId: 'TASK-001',
      title: 'Task',
      description: 'Task',
      status: 'done',
      priority: 'P0',
      ownerPersonaId: 'eng-001',
      proofIds: ['PRF-001'],
      createdAt: now,
      updatedAt: now
    }
  ];
}

describe('autopilot completion gate', () => {
  it('preserves legacy completion behavior when autopilot metadata is missing', () => {
    const run = buildBaseRun();
    const next = evaluateRunProgress(run, buildDoneTask(), 1);
    expect(next.status).toBe('completed');
  });

  it('keeps autopilot runs in verifying until QA and approvals are complete', () => {
    const run: Run = {
      ...buildBaseRun(),
      autopilot: {
        phase: 'qa',
        state: 'awaiting_qa',
        qa: {
          result: 'pending',
          cyclesCompleted: 0,
          maxCycles: 5,
          repeatedFailureCount: 0
        },
        validation: {
          roundsCompleted: 0,
          maxRounds: 3
        },
        reviews: {
          architect: { decision: 'pending' },
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
    };

    const next = evaluateRunProgress(run, buildDoneTask(), 1);
    expect(next.status).toBe('verifying');
    expect(next.autopilot?.state).toBe('awaiting_qa');
  });

  it('allows completion when autopilot QA and all approvals are satisfied', () => {
    const now = new Date().toISOString();
    const run: Run = {
      ...buildBaseRun(),
      autopilot: {
        phase: 'validation',
        state: 'approved',
        qa: {
          result: 'pass',
          cyclesCompleted: 1,
          maxCycles: 5,
          repeatedFailureCount: 0,
          summary: 'QA passed',
          actor: 'investor-1',
          updatedAt: now
        },
        validation: {
          roundsCompleted: 0,
          maxRounds: 3
        },
        reviews: {
          architect: { decision: 'approve', summary: 'approved', actor: 'investor-1', updatedAt: now },
          security: { decision: 'approve', summary: 'approved', actor: 'investor-1', updatedAt: now },
          code: { decision: 'approve', summary: 'approved', actor: 'investor-1', updatedAt: now }
        },
        planFiles: {
          spec: '.omx/plans/autopilot-spec.md',
          implementation: '.omx/plans/autopilot-impl.md',
          checklist: '.omx/plans/autopilot-checklist.md'
        },
        updatedAt: now
      }
    };

    const next = evaluateRunProgress(run, buildDoneTask(), 1);
    expect(next.status).toBe('completed');
    expect(next.autopilot?.phase).toBe('complete');
    expect(next.autopilot?.state).toBe('complete');
  });
});
