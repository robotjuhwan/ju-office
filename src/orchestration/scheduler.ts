import type { Run } from '../types/run.js';
import type { Task } from '../types/task.js';

const verificationPrioritySet = new Set(['P0', 'P1']);

export function isReadyForVerification(tasks: Task[]): boolean {
  const hasDoneTask = tasks.some((task) => task.status === 'done');
  const hasInProgress = tasks.some((task) => task.status === 'in_progress');
  const p0p1Complete = tasks
    .filter((task) => verificationPrioritySet.has(task.priority))
    .every((task) => ['done', 'failed', 'cancelled'].includes(task.status));

  return hasDoneTask && !hasInProgress && p0p1Complete;
}

export function shouldBlockExecution(tasks: Task[]): boolean {
  const hasBlocked = tasks.some((task) => task.status === 'blocked');
  const hasInProgress = tasks.some((task) => task.status === 'in_progress');
  return hasBlocked && !hasInProgress;
}

export function updateRunMetrics(run: Run, tasks: Task[], proofsVerified: number): Run {
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  return {
    ...run,
    metrics: {
      tasksTotal: tasks.length,
      tasksDone: doneCount,
      proofsVerified
    }
  };
}
