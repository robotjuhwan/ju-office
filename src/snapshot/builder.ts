import { snapshotSchema, snapshotStaleAfterSec } from '../contracts/snapshot.contract.js';
import type { OfficeSnapshot } from '../types/snapshot.js';
import type { AppPaths } from '../store/paths.js';
import { readRun, readRunIndex } from '../store/run-store.js';
import { readTasks } from '../store/task-store.js';
import { readEvents } from '../store/event-log.js';
import { listProofs } from '../store/proof-store.js';
import { readActiveRunLock } from '../store/lock-service.js';
import { writeJsonAtomic } from '../utils/fs.js';
import { nowIso } from '../utils/time.js';
import { resolvePersonaFloorProfile } from './floor-plan.js';

async function resolveRunId(paths: AppPaths, explicitRunId?: string): Promise<string | null> {
  if (explicitRunId) {
    return explicitRunId;
  }

  const activeRunId = await readActiveRunLock(paths);
  if (activeRunId) {
    return activeRunId;
  }

  const runIndex = await readRunIndex(paths);
  if (runIndex.length === 0) {
    return null;
  }

  return runIndex[runIndex.length - 1] ?? null;
}

function emptySnapshot(): OfficeSnapshot {
  return {
    generatedAt: nowIso(),
    staleAfterSec: snapshotStaleAfterSec,
    runSummary: {
      runId: 'none',
      goal: 'No active run',
      status: 'stopped',
      metrics: {
        tasksTotal: 0,
        tasksDone: 0,
        proofsVerified: 0
      }
    },
    orgView: [],
    taskBoard: [],
    commandFeed: [],
    artifactPanel: []
  };
}

export async function buildOfficeSnapshot(paths: AppPaths, explicitRunId?: string): Promise<OfficeSnapshot> {
  const runId = await resolveRunId(paths, explicitRunId);
  if (!runId) {
    const snapshot = emptySnapshot();
    snapshotSchema.parse(snapshot);
    await writeJsonAtomic(paths.snapshotLatestFile, snapshot);
    return snapshot;
  }

  const run = await readRun(paths, runId);
  if (!run) {
    const snapshot = emptySnapshot();
    snapshotSchema.parse(snapshot);
    await writeJsonAtomic(paths.snapshotLatestFile, snapshot);
    return snapshot;
  }

  const [tasks, events, proofs] = await Promise.all([
    readTasks(paths, runId),
    readEvents(paths, runId),
    listProofs(paths, runId)
  ]);

  const assignmentCounts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.ownerPersonaId] = (acc[task.ownerPersonaId] ?? 0) + 1;
    return acc;
  }, {});

  const snapshot: OfficeSnapshot = {
    generatedAt: nowIso(),
    staleAfterSec: snapshotStaleAfterSec,
    runSummary: {
      runId: run.runId,
      goal: run.goal,
      status: run.status,
      metrics: run.metrics,
      ...(run.autopilot
        ? {
            autopilot: {
              phase: run.autopilot.phase,
              state: run.autopilot.state,
              qaResult: run.autopilot.qa.result,
              qaCyclesCompleted: run.autopilot.qa.cyclesCompleted,
              qaMaxCycles: run.autopilot.qa.maxCycles,
              validationRoundsCompleted: run.autopilot.validation.roundsCompleted,
              validationMaxRounds: run.autopilot.validation.maxRounds,
              approvals: {
                architect: run.autopilot.reviews.architect.decision,
                security: run.autopilot.reviews.security.decision,
                code: run.autopilot.reviews.code.decision
              }
            }
          }
        : {})
    },
    orgView: run.personas.map((persona) => ({
      ...resolvePersonaFloorProfile(persona.id, persona.role),
      personaId: persona.id,
      role: persona.role,
      assignmentCount: assignmentCounts[persona.id] ?? 0,
      objective: persona.objective
    })),
    taskBoard: tasks.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      ownerPersonaId: task.ownerPersonaId,
      proofIds: task.proofIds
    })),
    commandFeed: events
      .slice(-50)
      .map((event) => ({ eventId: event.eventId, command: event.command, actor: event.actor, timestamp: event.timestamp })),
    artifactPanel: proofs
      .sort((a, b) => {
        const score = (status: string): number => {
          if (status === 'verified') {
            return 0;
          }
          if (status === 'pending') {
            return 1;
          }
          return 2;
        };
        return score(a.verification.status) - score(b.verification.status);
      })
      .map((proof) => ({
        proofId: proof.proofId,
        taskId: proof.taskId,
        uri: proof.uri,
        status: proof.verification.status,
        reasonCode: proof.verification.reasonCode
      }))
  };

  snapshotSchema.parse(snapshot);
  await writeJsonAtomic(paths.snapshotLatestFile, snapshot);
  return snapshot;
}
