import { describe, expect, it } from 'vitest';

import { renderArtifactPanel, renderCommandFeed, renderOrgSprites, renderRunSummary, renderTaskBoard } from '../../web/app.js';

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
    {
      personaId: 'ceo-001',
      role: 'CEO',
      assignmentCount: 0,
      objective: 'Lead strategy and investor confidence',
      character: { avatar: '👑', style: 'executive-luminary', accentColor: '#8b5cf6' },
      coordinates: { xPct: 14, yPct: 18, zone: 'Executive Suite', room: 'Strategy Desk' }
    },
    {
      personaId: 'eng-001',
      role: 'ENG',
      assignmentCount: 2,
      objective: 'Ship deterministic implementation quickly',
      character: { avatar: '🛠️', style: 'build-artisan', accentColor: '#10b981' },
      coordinates: { xPct: 50, yPct: 74, zone: 'Build Bay', room: 'Test Bench' }
    }
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

  it('renders colorful floor zones and rich per-agent character cards from snapshot data', () => {
    const floorMarkup = renderOrgSprites(snapshot);
    expect(floorMarkup).toContain('zone-executive');
    expect(floorMarkup).toContain('zone-build');
    expect(floorMarkup).toContain('sprite-aura');
    expect(floorMarkup).toContain('sprite-flair');
    expect(floorMarkup).toContain('sprite-style-chip');
    expect(floorMarkup).toContain('sprite-role-chip');
    expect(floorMarkup).toContain('sprite-focus-chip');
    expect(floorMarkup).toContain('sprite-assignment-chip');
    expect(floorMarkup).toContain('👑');
    expect(floorMarkup).toContain('🛠️');
    expect(floorMarkup).toContain('--x:14;--y:18;');
    expect(floorMarkup).toContain('--x:50;--y:74;');
    expect(floorMarkup).toContain('CEO · Executive Lead');
    expect(floorMarkup).toContain('ENG · Implementation Ace');
    expect(floorMarkup).toContain('2 assignments');
    expect(floorMarkup).toContain('📍 Executive Suite / Strategy Desk · (14, 18)');
    expect(floorMarkup).toContain('📍 Build Bay / Test Bench · (50, 74)');
  });

  it('falls back safely when legacy orgView entries omit character/coordinates', () => {
    const legacySnapshot = {
      ...snapshot,
      orgView: [
        {
          personaId: 'legacy-001',
          role: 'CEO',
          assignmentCount: 0,
          objective: 'Legacy payload without floor metadata'
        }
      ]
    } as any;

    const floorMarkup = renderOrgSprites(legacySnapshot);
    expect(floorMarkup).toContain('legacy-001');
    expect(floorMarkup).toContain('Executive Suite / Strategy Desk');
    expect(floorMarkup).toContain('executive-luminary');
    expect(floorMarkup).toContain('--accent:#8b5cf6');
  });

  it('sanitizes invalid accent colors before injecting inline styles', () => {
    const unsafeSnapshot = {
      ...snapshot,
      orgView: [
        {
          personaId: 'unsafe-001',
          role: 'ENG',
          assignmentCount: 1,
          objective: 'Attempt style injection',
          character: {
            avatar: '🛠️',
            style: 'build-artisan',
            accentColor: '#10b981;transform:scale(99)'
          },
          coordinates: {
            xPct: 50,
            yPct: 74,
            zone: 'Build Bay',
            room: 'Test Bench'
          }
        }
      ]
    } as any;

    const floorMarkup = renderOrgSprites(unsafeSnapshot);
    expect(floorMarkup).toContain('--accent:#10b981');
    expect(floorMarkup).not.toContain('scale(99)');
  });
});
