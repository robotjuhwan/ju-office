import { runSchema } from '../contracts/run.contract.js';
import { taskSchema } from '../contracts/task.contract.js';
import { canCompleteRun } from '../artifacts/proof-gate.js';
import { canTransitionRun } from '../domain/run-lifecycle.js';
import { buildDefaultPersonas, workerPersonaIds } from './org-builder.js';
import { buildPlanSeeds } from './ceo-planner.js';
import { createAutopilotMetadata, hasAutopilotCompletionApproval, syncAutopilotLifecycle } from './autopilot-lifecycle.js';
import { isReadyForVerification, shouldBlockExecution, updateRunMetrics } from './scheduler.js';
import type { Run, RunStatus } from '../types/run.js';
import type { Task } from '../types/task.js';
import type { AppPaths } from '../store/paths.js';
import { createRunId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';

export interface StartRunResult {
  run: Run;
  tasks: Task[];
}

export async function initializeRun(goal: string, paths: AppPaths, runId = createRunId()): Promise<StartRunResult> {
  const now = nowIso();
  const personas = buildDefaultPersonas();
  const autopilot = await createAutopilotMetadata(paths, runId, goal, now);

  let run: Run = {
    runId,
    goal,
    status: 'queued',
    personas,
    createdAt: now,
    updatedAt: now,
    metrics: {
      tasksTotal: 0,
      tasksDone: 0,
      proofsVerified: 0
    },
    autopilot
  };

  run = transitionRun(run, 'planning');

  const planSeeds = await buildPlanSeeds(goal, paths.plannerTemplatesFile, paths.plannerKeywordRulesFile);
  if (planSeeds.length < 4 || planSeeds.length > 20) {
    throw new Error(`Planned task count ${planSeeds.length} is outside 4..20`);
  }

  const workerIds = workerPersonaIds();
  const tasks: Task[] = planSeeds.map((seed, index) => ({
    taskId: `TASK-${String(index + 1).padStart(3, '0')}`,
    title: seed.title,
    description: seed.description,
    status: 'ready',
    priority: seed.priority,
    ownerPersonaId: workerIds[index % workerIds.length],
    proofIds: [],
    createdAt: now,
    updatedAt: now
  }));

  for (const task of tasks) {
    taskSchema.parse(task);
  }

  run = transitionRun(run, 'executing');
  run = updateRunMetrics(run, tasks, 0);
  run = syncAutopilotLifecycle(run);
  runSchema.parse(run);

  return { run, tasks };
}

export function transitionRun(run: Run, nextStatus: RunStatus, reason?: string): Run {
  if (!canTransitionRun(run.status, nextStatus)) {
    throw new Error(`Invalid run transition from ${run.status} to ${nextStatus}`);
  }

  let next: Run = {
    ...run,
    status: nextStatus,
    updatedAt: nowIso()
  };

  if (nextStatus === 'paused' && reason) {
    next.pauseReason = reason;
  }
  if (nextStatus === 'blocked' && reason) {
    next.blockedReason = reason;
  }
  if (nextStatus === 'stopped' && reason) {
    next.stopReason = reason;
  }
  if (nextStatus === 'failed' && reason) {
    next.failureReason = reason;
  }

  next = syncAutopilotLifecycle(next);
  runSchema.parse(next);
  return next;
}

export function evaluateRunProgress(run: Run, tasks: Task[], proofsVerified: number): Run {
  let nextRun = updateRunMetrics(run, tasks, proofsVerified);

  if (nextRun.status === 'executing' && shouldBlockExecution(tasks)) {
    nextRun = transitionRun(nextRun, 'blocked', 'Execution blocked by task state');
  }

  if ((nextRun.status === 'executing' || nextRun.status === 'blocked') && isReadyForVerification(tasks)) {
    if (canTransitionRun(nextRun.status, 'verifying')) {
      nextRun = transitionRun(nextRun, 'verifying');
    }
  }

  if (nextRun.status === 'verifying' && canCompleteRun(nextRun.metrics.tasksDone, nextRun.metrics.proofsVerified)) {
    const isAutopilotApproved = nextRun.autopilot ? hasAutopilotCompletionApproval(nextRun.autopilot) : true;
    if (isAutopilotApproved) {
      nextRun = transitionRun(nextRun, 'completed');
    }
  }

  return syncAutopilotLifecycle(nextRun);
}
