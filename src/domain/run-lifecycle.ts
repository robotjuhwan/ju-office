import type { RunStatus } from '../types/run.js';

export const terminalRunStatuses: RunStatus[] = ['stopped', 'failed', 'completed'];

const transitionMap: Record<RunStatus, RunStatus[]> = {
  queued: ['planning', 'paused', 'stopped', 'failed'],
  planning: ['executing', 'paused', 'stopped', 'failed'],
  executing: ['verifying', 'blocked', 'paused', 'stopped', 'failed'],
  verifying: ['completed', 'blocked', 'failed', 'paused', 'stopped'],
  paused: ['executing', 'stopped', 'failed'],
  blocked: ['executing', 'paused', 'stopped', 'failed'],
  stopped: [],
  failed: [],
  completed: []
};

export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalRunStatuses.includes(status);
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return transitionMap[from].includes(to);
}

export function requireRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid run transition from ${from} to ${to}`);
  }
}
