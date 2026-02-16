import { describe, expect, it } from 'vitest';

import { renderArtifactPanel, renderCommandFeed, renderRunSummary, renderTaskBoard } from '../../web/app.js';

const snapshot = {
  generatedAt: new Date().toISOString(),
  staleAfterSec: 300,
  runSummary: {
    runId: 'run_20260216T093000Z_ab12cd',
    goal: 'Launch Ju Office MVP',
    status: 'executing',
    metrics: { tasksTotal: 4, tasksDone: 1, proofsVerified: 1 }
  },
  orgView: [
    { personaId: 'ceo-001', role: 'CEO', assignmentCount: 0, objective: 'Lead' },
    { personaId: 'eng-001', role: 'ENG', assignmentCount: 2, objective: 'Ship' }
  ],
  taskBoard: [
    {
      taskId: 'TASK-001',
      title: 'Task 1',
      status: 'done',
      priority: 'P0',
      ownerPersonaId: 'eng-001',
      proofIds: ['PRF-001']
    }
  ],
  commandFeed: [
    {
      eventId: 'EVT-1',
      command: 'start',
      actor: 'investor-1',
      timestamp: new Date().toISOString()
    }
  ],
  artifactPanel: [
    {
      proofId: 'PRF-001',
      taskId: 'TASK-001',
      uri: 'file:///tmp/proof.txt',
      status: 'verified',
      reasonCode: 'E_NONE'
    }
  ]
};

describe('ui render from snapshot', () => {
  it('renders summary/task/feed/artifacts from provided snapshot', () => {
    expect(renderRunSummary(snapshot)).toContain('run_20260216T093000Z_ab12cd');
    expect(renderTaskBoard(snapshot)).toContain('TASK-001');
    expect(renderCommandFeed(snapshot)).toContain('start');
    expect(renderArtifactPanel(snapshot)).toContain('PRF-001');
  });
});
