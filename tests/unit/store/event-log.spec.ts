import { describe, expect, it } from 'vitest';

import { appendEvent, readEvents } from '../../../src/store/event-log.js';
import { resolvePaths } from '../../../src/store/paths.js';
import { createTestWorkspace } from '../../helpers/test-env.js';

describe('event log', () => {
  it('validates event schema before append', async () => {
    const ws = await createTestWorkspace();
    try {
      const paths = resolvePaths(ws.rootDir);
      await expect(
        appendEvent(paths, 'run_20260216T093000Z_ab12cd', {
          eventId: 'EVT-20260216093000-0001',
          runId: 'run_20260216T093000Z_ab12cd',
          type: 'command',
          command: 'start',
          actor: '',
          timestamp: new Date().toISOString(),
          payload: {}
        })
      ).rejects.toMatchObject({ code: 'E_CONTRACT_VALIDATION' });
    } finally {
      await ws.cleanup();
    }
  });

  it('appends validated events', async () => {
    const ws = await createTestWorkspace();
    try {
      const paths = resolvePaths(ws.rootDir);
      const runId = 'run_20260216T093000Z_ab12cd';
      await appendEvent(paths, runId, {
        eventId: 'EVT-20260216093000-0001',
        runId,
        type: 'command',
        command: 'start',
        actor: 'investor-1',
        timestamp: new Date().toISOString(),
        payload: { goal: 'Launch product' }
      });

      const events = await readEvents(paths, runId);
      expect(events).toHaveLength(1);
      expect(events[0]?.command).toBe('start');
    } finally {
      await ws.cleanup();
    }
  });
});
