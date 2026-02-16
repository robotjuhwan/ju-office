import { describe, expect, it } from 'vitest';

import { eventSchema } from '../../../src/contracts/event.contract.js';

describe('event contract', () => {
  it('validates event entries', () => {
    const parsed = eventSchema.parse({
      eventId: 'EVT-20260216093000-0001',
      runId: 'run_20260216T093000Z_ab12cd',
      type: 'command',
      command: 'start',
      actor: 'investor-1',
      timestamp: new Date().toISOString(),
      payload: { goal: 'Launch product' }
    });

    expect(parsed.command).toBe('start');
  });
});
