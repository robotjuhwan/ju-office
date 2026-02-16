import crypto from 'node:crypto';

import { toRunTimestamp } from './time.js';

export function createRunId(now = new Date()): string {
  const suffix = crypto.randomBytes(3).toString('hex');
  return `run_${toRunTimestamp(now)}_${suffix}`;
}

export function createEventId(now = new Date(), sequence = 0): string {
  const ts = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `EVT-${ts}-${String(sequence).padStart(4, '0')}`;
}

export function createProofId(existingCount: number): string {
  return `PRF-${String(existingCount + 1).padStart(3, '0')}`;
}
