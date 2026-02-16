import type { TaskStatus } from '../types/task.js';

export const terminalTaskStatuses: TaskStatus[] = ['done', 'failed', 'cancelled'];

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return terminalTaskStatuses.includes(status);
}
