import { describe, expect, it } from 'vitest';

import { canTransitionRun } from '../../../src/domain/run-lifecycle.js';

describe('run lifecycle transitions', () => {
  it('allows valid transitions from contract table', () => {
    expect(canTransitionRun('queued', 'planning')).toBe(true);
    expect(canTransitionRun('planning', 'executing')).toBe(true);
    expect(canTransitionRun('executing', 'verifying')).toBe(true);
    expect(canTransitionRun('executing', 'blocked')).toBe(true);
    expect(canTransitionRun('paused', 'executing')).toBe(true);
    expect(canTransitionRun('paused', 'verifying')).toBe(true);
    expect(canTransitionRun('verifying', 'completed')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionRun('executing', 'queued')).toBe(false);
    expect(canTransitionRun('completed', 'executing')).toBe(false);
    expect(canTransitionRun('stopped', 'paused')).toBe(false);
  });
});
