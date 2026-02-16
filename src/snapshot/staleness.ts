import type { OfficeSnapshot } from '../types/snapshot.js';

export function isSnapshotStale(snapshot: OfficeSnapshot, nowMs = Date.now()): boolean {
  const generated = Date.parse(snapshot.generatedAt);
  if (Number.isNaN(generated)) {
    return true;
  }
  return nowMs - generated > snapshot.staleAfterSec * 1000;
}
