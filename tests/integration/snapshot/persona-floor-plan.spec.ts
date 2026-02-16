import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBuildSnapshot } from '../../../scripts/build-snapshot.js';
import { snapshotSchema } from '../../../src/contracts/snapshot.contract.js';
import { createTestWorkspace, runCliCommand } from '../../helpers/test-env.js';

describe('snapshot persona floor plan mapping', () => {
  it('builds deterministic orgView characters and coordinates', async () => {
    const ws = await createTestWorkspace();
    try {
      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Validate deterministic floor-plan coordinates and character mapping for office personas',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-floor-plan-1'
      ]);

      expect(start.exitCode).toBe(0);

      const readSnapshot = async () => {
        const raw = await readFile(path.join(ws.rootDir, 'data', 'snapshot', 'latest.json'), 'utf8');
        return snapshotSchema.parse(JSON.parse(raw) as unknown);
      };

      const firstSnapshot = await readSnapshot();
      const byPersonaId = new Map(firstSnapshot.orgView.map((persona) => [persona.personaId, persona]));

      expect(byPersonaId.get('ceo-001')).toMatchObject({
        role: 'CEO',
        character: { avatar: '👑', style: 'executive-luminary', accentColor: '#8b5cf6' },
        coordinates: { xPct: 14, yPct: 18, zone: 'Executive Suite', room: 'Strategy Desk' }
      });
      expect(byPersonaId.get('cto-001')).toMatchObject({
        role: 'CTO',
        character: { avatar: '🧠', style: 'systems-sage', accentColor: '#0ea5e9' },
        coordinates: { xPct: 34, yPct: 58, zone: 'Engineering Lab', room: 'Architecture Pod' }
      });
      expect(byPersonaId.get('pm-001')).toMatchObject({
        role: 'PM',
        character: { avatar: '🧭', style: 'roadmap-curator', accentColor: '#f59e0b' },
        coordinates: { xPct: 70, yPct: 27, zone: 'Planning Room', room: 'Backlog Board' }
      });
      expect(byPersonaId.get('eng-001')).toMatchObject({
        role: 'ENG',
        character: { avatar: '🛠️', style: 'build-artisan', accentColor: '#10b981' },
        coordinates: { xPct: 50, yPct: 74, zone: 'Build Bay', room: 'Test Bench' }
      });
      expect(byPersonaId.get('ops-001')).toMatchObject({
        role: 'OPS',
        character: { avatar: '🚀', style: 'mission-orchestrator', accentColor: '#ec4899' },
        coordinates: { xPct: 82, yPct: 63, zone: 'Ops NOC', room: 'Publish Console' }
      });

      await runBuildSnapshot(ws.rootDir);
      const rebuiltSnapshot = await readSnapshot();
      expect(rebuiltSnapshot.orgView).toEqual(firstSnapshot.orgView);
    } finally {
      await ws.cleanup();
    }
  });
});
