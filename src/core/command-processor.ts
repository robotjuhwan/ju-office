import { z } from 'zod';

import { canMarkTaskDone } from '../artifacts/proof-gate.js';
import { createAndVerifyProof } from '../artifacts/proof-service.js';
import { runIdPattern } from '../contracts/run.contract.js';
import { sha256Pattern } from '../contracts/proof.contract.js';
import { taskIdPattern, taskPrioritySchema } from '../contracts/task.contract.js';
import { parseCommand } from '../cli/parser.js';
import type {
  ParsedCommand,
  ParsedMessageCommand,
  ParsedPauseCommand,
  ParsedReprioritizeCommand,
  ParsedResumeCommand,
  ParsedStartCommand,
  ParsedStatusCommand,
  ParsedStopCommand
} from '../cli/types.js';
import {
  canActorReadStatus,
  isActorAuthorized,
  isAuthTokenValid,
  isStatusOpen,
  loadAuthConfig,
  resolvePerHourLimit,
  resolveProofValidationPolicy
} from './auth.js';
import { commitIdempotency, ensureIdempotency } from './idempotency.js';
import { JuCliError } from './error-codes.js';
import { checkAndConsumeRateLimit } from './rate-limit.js';
import { isTerminalRunStatus } from '../domain/run-lifecycle.js';
import { evaluateRunProgress, initializeRun, transitionRun } from '../orchestration/run-engine.js';
import { buildOfficeSnapshot } from '../snapshot/builder.js';
import { appendEvent, readEvents } from '../store/event-log.js';
import { clearActiveRunLock, readActiveRunLock, writeActiveRunLock } from '../store/lock-service.js';
import { initStorage } from '../store/init-storage.js';
import { resolvePaths } from '../store/paths.js';
import { listProofs } from '../store/proof-store.js';
import { appendRunIndex, readRun, readRunIndex, writeRun } from '../store/run-store.js';
import { readTasks, writeTasks } from '../store/task-store.js';
import type { JuEvent } from '../types/event.js';
import type { Run } from '../types/run.js';
import { createEventId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';

const startValidationSchema = z.object({
  goal: z.string().min(10).max(280),
  actor: z.string().min(1),
  authToken: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const reasonValidationSchema = z.object({
  reason: z.string().min(3).max(280),
  actor: z.string().min(1),
  authToken: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const reprioritizeValidationSchema = z.object({
  taskId: z.string().regex(taskIdPattern),
  priority: taskPrioritySchema,
  reason: z.string().min(3).max(280),
  actor: z.string().min(1),
  authToken: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const messageValidationSchema = z
  .object({
    to: z.string().min(1),
    text: z.string().min(1).max(500),
    taskId: z.string().regex(taskIdPattern).optional(),
    proofUri: z.string().optional(),
    proofSha256: z.string().optional(),
    completeTask: z.boolean(),
    actor: z.string().min(1),
    authToken: z.string().min(1),
    idempotencyKey: z.string().min(1)
  })
  .superRefine((value, ctx) => {
    if (value.completeTask) {
      if (!value.taskId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--task-id is required when --complete-task is set' });
      }
      if (!value.proofUri) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--proof-uri is required when --complete-task is set' });
      }
      if (!value.proofSha256) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '--proof-sha256 is required when --complete-task is set' });
      }

      if (value.proofUri && !(value.proofUri.startsWith('file://') || value.proofUri.startsWith('https://'))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Proof URI must use file:// or https://' });
      }

      if (value.proofSha256 && !sha256Pattern.test(value.proofSha256)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Proof SHA-256 must be lowercase 64-hex' });
      }
    }
  });

const statusValidationSchema = z.object({
  runId: z.string().regex(runIdPattern).optional(),
  actor: z.string().min(1).optional(),
  authToken: z.string().min(1).optional()
});

const MAX_RUN_DURATION_MINUTES = 240;
const MAX_RUN_DURATION_MS = MAX_RUN_DURATION_MINUTES * 60 * 1000;
const DISALLOWED_GOAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(?:malware|ransomware|spyware|botnet)\b/i, reason: 'malware operations are not allowed' },
  { pattern: /\b(?:phishing|credential\s*steal(?:er|ing)?|account\s*takeover)\b/i, reason: 'credential abuse is not allowed' },
  { pattern: /\b(?:ddos|denial[-\s]?of[-\s]?service)\b/i, reason: 'service disruption attacks are not allowed' },
  { pattern: /\b(?:exploit|zero[-\s]?day)\b/i, reason: 'offensive exploitation goals are not allowed' },
  { pattern: /\b(?:fraud|money\s*launder|stolen\s*card)\b/i, reason: 'financial abuse is not allowed' }
];
const MAX_AUTH_FAILURES_PER_HOUR = 12;

interface SuccessPayload {
  ok: true;
  data: unknown;
}

function parseValidationError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new JuCliError('E_CONTRACT_VALIDATION', error.issues.map((issue) => issue.message).join('; '));
  }
  throw error;
}

function enforceGoalPolicy(goal: string): void {
  for (const rule of DISALLOWED_GOAL_PATTERNS) {
    if (rule.pattern.test(goal)) {
      throw new JuCliError('E_CONTRACT_VALIDATION', `Startup goal rejected by policy: ${rule.reason}`, {
        policy: 'goal-safety',
        reason: rule.reason
      });
    }
  }
}

function requireNonTerminalRun(run: Run, command: string): void {
  if (isTerminalRunStatus(run.status)) {
    throw new JuCliError('E_INVALID_TRANSITION', `Cannot ${command} when run status is ${run.status}`, {
      command,
      runId: run.runId
    });
  }
}

function enforceRunDurationBudget(run: Run, command: string): void {
  const createdAtMs = Date.parse(run.createdAt);
  if (Number.isNaN(createdAtMs)) {
    return;
  }

  if (Date.now() - createdAtMs > MAX_RUN_DURATION_MS) {
    throw new JuCliError(
      'E_INVALID_TRANSITION',
      `Cannot ${command}: run exceeded max duration of ${MAX_RUN_DURATION_MINUTES} minutes`,
      {
        command,
        runId: run.runId,
        maxDurationMinutes: MAX_RUN_DURATION_MINUTES
      }
    );
  }
}

async function authorizeMutatingActor(
  paths: ReturnType<typeof resolvePaths>,
  actor: string,
  authToken: string,
  command: Exclude<ParsedCommand['command'], 'status'>,
  authConfig: Awaited<ReturnType<typeof loadAuthConfig>>
): Promise<void> {
  if (!isActorAuthorized(authConfig, actor, command)) {
    await checkAndConsumeRateLimit(paths, actor, `authz-denied:${command}`, MAX_AUTH_FAILURES_PER_HOUR);
    throw new JuCliError('E_UNAUTHORIZED_ACTOR', `Actor ${actor} is not authorized for ${command}`, {
      actor,
      command
    });
  }

  if (!isAuthTokenValid(authConfig, actor, authToken)) {
    await checkAndConsumeRateLimit(paths, actor, `auth-failed:${command}`, MAX_AUTH_FAILURES_PER_HOUR);
    throw new JuCliError('E_UNAUTHORIZED_ACTOR', `Invalid auth token for actor ${actor}`, {
      actor,
      command
    });
  }
}

function enforceStatusPolicy(
  authConfig: Awaited<ReturnType<typeof loadAuthConfig>>,
  actor?: string,
  authToken?: string
): void {
  if (isStatusOpen(authConfig)) {
    return;
  }

  if (!actor || !authToken) {
    throw new JuCliError(
      'E_UNAUTHORIZED_ACTOR',
      'status requires --actor and --auth-token when readOnlyOpen is false',
      { command: 'status' }
    );
  }

  if (!canActorReadStatus(authConfig, actor) || !isAuthTokenValid(authConfig, actor, authToken)) {
    throw new JuCliError('E_UNAUTHORIZED_ACTOR', `Actor ${actor} is not authorized for status`, {
      actor,
      command: 'status'
    });
  }
}

function transitionRunForCommand(
  run: Run,
  runId: string,
  command: 'pause' | 'resume' | 'stop',
  nextStatus: Run['status'],
  reason?: string
): Run {
  try {
    return transitionRun(run, nextStatus, reason);
  } catch (error) {
    if (error instanceof JuCliError) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith('Invalid run transition')) {
      throw new JuCliError('E_INVALID_TRANSITION', `Cannot ${command} when run status is ${run.status}`, {
        command,
        runId
      });
    }
    throw error;
  }
}

async function buildCommandEvent(
  runId: string,
  command: ParsedCommand['command'],
  actor: string,
  payload: Record<string, unknown>,
  eventCount: number
): Promise<JuEvent> {
  return {
    eventId: createEventId(new Date(), eventCount + 1),
    runId,
    type: 'command',
    command,
    actor,
    timestamp: nowIso(),
    payload
  };
}

async function resolveTargetRunId(rootDir: string, explicitRunId?: string): Promise<string | null> {
  const paths = resolvePaths(rootDir);
  const activeRunId = await readActiveRunLock(paths);
  if (explicitRunId) {
    return explicitRunId;
  }
  if (activeRunId) {
    return activeRunId;
  }

  const runIndex = await readRunIndex(paths);
  return runIndex.length ? (runIndex[runIndex.length - 1] ?? null) : null;
}

async function processStart(rootDir: string, command: ParsedStartCommand): Promise<SuccessPayload> {
  try {
    startValidationSchema.parse(command);
  } catch (error) {
    parseValidationError(error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);

  const authConfig = await loadAuthConfig(paths.authConfigFile);
  await authorizeMutatingActor(paths, command.actor, command.authToken, 'start', authConfig);
  await checkAndConsumeRateLimit(paths, command.actor, 'start', resolvePerHourLimit(authConfig, 'start'));
  enforceGoalPolicy(command.goal);

  const activeRunId = await readActiveRunLock(paths);
  if (activeRunId) {
    const activeRun = await readRun(paths, activeRunId);
    if (activeRun && !isTerminalRunStatus(activeRun.status)) {
      const idempotencyCheck = await ensureIdempotency(paths, activeRunId, command.idempotencyKey, command);
      if (idempotencyCheck.replay) {
        return idempotencyCheck.storedResponse as SuccessPayload;
      }

      throw new JuCliError('E_ACTIVE_RUN_LOCK', `Run ${activeRunId} is already active`, {
        runId: activeRunId
      });
    }

    await clearActiveRunLock(paths);
  }

  let initialized;
  try {
    initialized = await initializeRun(command.goal, paths);
  } catch (error) {
    if (error instanceof Error && error.message.includes('outside 4..20')) {
      throw new JuCliError('E_CONTRACT_VALIDATION', error.message);
    }
    throw error;
  }

  const runId = initialized.run.runId;
  const idempotency = await ensureIdempotency(paths, runId, command.idempotencyKey, command);
  if (idempotency.replay) {
    return idempotency.storedResponse as SuccessPayload;
  }

  try {
    await writeActiveRunLock(paths, runId);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? ((error as { code: string }).code as string)
        : '';

    if (code === 'EEXIST') {
      const lockedRunId = await readActiveRunLock(paths);
      throw new JuCliError('E_ACTIVE_RUN_LOCK', `Run ${lockedRunId ?? 'unknown'} is already active`, {
        runId: lockedRunId ?? undefined
      });
    }
    throw error;
  }

  let event: JuEvent | null = null;
  try {
    const existingEvents = await readEvents(paths, runId);
    event = await buildCommandEvent(runId, 'start', command.actor, { goal: command.goal }, existingEvents.length);
    await appendEvent(paths, runId, event);

    await writeRun(paths, initialized.run);
    await writeTasks(paths, runId, initialized.tasks);
    await appendRunIndex(paths, runId);
  } catch (error) {
    try {
      await clearActiveRunLock(paths);
    } catch {
      // preserve original error
    }
    throw error;
  }

  if (!event) {
    throw new JuCliError('E_STORAGE_IO', 'Start event could not be created');
  }

  const response: SuccessPayload = {
    ok: true,
    data: {
      runId,
      status: initialized.run.status
    }
  };

  await commitIdempotency(paths, runId, command.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  await buildOfficeSnapshot(paths, runId);

  return response;
}

async function requireActiveRun(
  rootDir: string,
  commandForBudget?: 'pause' | 'resume' | 'reprioritize' | 'message'
): Promise<{ runId: string; run: Run }> {
  const paths = resolvePaths(rootDir);
  const runId = await readActiveRunLock(paths);
  if (!runId) {
    throw new JuCliError('E_INVALID_TRANSITION', 'No active run available for mutating command');
  }

  const run = await readRun(paths, runId);
  if (!run) {
    throw new JuCliError('E_STORAGE_IO', `Active run ${runId} could not be loaded`);
  }

  if (commandForBudget) {
    enforceRunDurationBudget(run, commandForBudget);
  }

  return { runId, run };
}

async function processPauseOrResume(rootDir: string, command: ParsedPauseCommand | ParsedResumeCommand): Promise<SuccessPayload> {
  const parsed = reasonValidationSchema.safeParse(command);
  if (!parsed.success) {
    parseValidationError(parsed.error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  const actor = parsed.data.actor;

  await authorizeMutatingActor(paths, actor, parsed.data.authToken, command.command, authConfig);
  await checkAndConsumeRateLimit(paths, actor, command.command, resolvePerHourLimit(authConfig, command.command));

  const { runId, run } = await requireActiveRun(rootDir, command.command);
  if (command.command === 'pause') {
    requireNonTerminalRun(run, 'pause');
  }

  if (command.command === 'resume' && !['paused', 'blocked'].includes(run.status)) {
    throw new JuCliError('E_INVALID_TRANSITION', `Cannot resume when run status is ${run.status}`, {
      command: 'resume',
      runId
    });
  }

  const idempotency = await ensureIdempotency(paths, runId, parsed.data.idempotencyKey, command);
  if (idempotency.replay) {
    return idempotency.storedResponse as SuccessPayload;
  }

  const existingEvents = await readEvents(paths, runId);
  const event = await buildCommandEvent(
    runId,
    command.command,
    actor,
    { reason: parsed.data.reason },
    existingEvents.length
  );
  await appendEvent(paths, runId, event);

  const nextStatus = command.command === 'pause' ? 'paused' : 'executing';
  const updatedRun = transitionRunForCommand(run, runId, command.command, nextStatus, parsed.data.reason);

  await writeRun(paths, updatedRun);

  const response: SuccessPayload = {
    ok: true,
    data: {
      runId,
      status: updatedRun.status
    }
  };

  await commitIdempotency(paths, runId, parsed.data.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  await buildOfficeSnapshot(paths, runId);

  return response;
}

async function processReprioritize(rootDir: string, command: ParsedReprioritizeCommand): Promise<SuccessPayload> {
  const parsed = reprioritizeValidationSchema.safeParse(command);
  if (!parsed.success) {
    parseValidationError(parsed.error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  await authorizeMutatingActor(paths, parsed.data.actor, parsed.data.authToken, 'reprioritize', authConfig);
  await checkAndConsumeRateLimit(
    paths,
    parsed.data.actor,
    'reprioritize',
    resolvePerHourLimit(authConfig, 'reprioritize')
  );

  const { runId, run } = await requireActiveRun(rootDir, 'reprioritize');
  requireNonTerminalRun(run, 'reprioritize');

  const idempotency = await ensureIdempotency(paths, runId, parsed.data.idempotencyKey, command);
  if (idempotency.replay) {
    return idempotency.storedResponse as SuccessPayload;
  }

  const tasks = await readTasks(paths, runId);
  const target = tasks.find((task) => task.taskId === parsed.data.taskId);
  if (!target) {
    throw new JuCliError('E_CONTRACT_VALIDATION', `Task ${parsed.data.taskId} does not exist`, {
      taskId: parsed.data.taskId
    });
  }

  const existingEvents = await readEvents(paths, runId);
  const event = await buildCommandEvent(
    runId,
    'reprioritize',
    parsed.data.actor,
    {
      taskId: parsed.data.taskId,
      priority: parsed.data.priority,
      reason: parsed.data.reason
    },
    existingEvents.length
  );
  await appendEvent(paths, runId, event);

  target.priority = parsed.data.priority;
  target.updatedAt = nowIso();

  await writeTasks(paths, runId, tasks);

  const response: SuccessPayload = {
    ok: true,
    data: {
      taskId: target.taskId,
      priority: target.priority
    }
  };

  await commitIdempotency(paths, runId, parsed.data.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  await buildOfficeSnapshot(paths, runId);

  return response;
}

function validateMessageTarget(to: string, run: Run): void {
  if (to === 'ceo' || to === 'all') {
    return;
  }

  if (!run.personas.some((persona) => persona.id === to)) {
    throw new JuCliError('E_CONTRACT_VALIDATION', `Unknown message recipient: ${to}`);
  }
}

async function processMessage(rootDir: string, command: ParsedMessageCommand): Promise<SuccessPayload> {
  const parsed = messageValidationSchema.safeParse(command);
  if (!parsed.success) {
    parseValidationError(parsed.error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  await authorizeMutatingActor(paths, parsed.data.actor, parsed.data.authToken, 'message', authConfig);
  await checkAndConsumeRateLimit(paths, parsed.data.actor, 'message', resolvePerHourLimit(authConfig, 'message'));

  const { runId, run } = await requireActiveRun(rootDir, 'message');
  requireNonTerminalRun(run, 'message');
  validateMessageTarget(parsed.data.to, run);

  const idempotency = await ensureIdempotency(paths, runId, parsed.data.idempotencyKey, command);
  if (idempotency.replay) {
    return idempotency.storedResponse as SuccessPayload;
  }

  const tasks = await readTasks(paths, runId);
  const existingEvents = await readEvents(paths, runId);
  const event = await buildCommandEvent(
    runId,
    'message',
    parsed.data.actor,
    {
      to: parsed.data.to,
      text: parsed.data.text,
      taskId: parsed.data.taskId,
      completeTask: parsed.data.completeTask
    },
    existingEvents.length
  );
  await appendEvent(paths, runId, event);

  let taskUpdate: Record<string, unknown> | undefined;
  let updatedRun = run;

  if (parsed.data.completeTask) {
    if (!isActorAuthorized(authConfig, parsed.data.actor, 'complete-task')) {
      throw new JuCliError('E_UNAUTHORIZED_ACTOR', `Actor ${parsed.data.actor} is not authorized for complete-task`, {
        actor: parsed.data.actor,
        command: 'complete-task'
      });
    }

    const task = tasks.find((candidate) => candidate.taskId === parsed.data.taskId);
    if (!task) {
      throw new JuCliError('E_CONTRACT_VALIDATION', `Task ${parsed.data.taskId} does not exist`, {
        taskId: parsed.data.taskId
      });
    }

    const proof = await createAndVerifyProof(
      paths,
      {
        runId,
        taskId: task.taskId,
        uri: parsed.data.proofUri as string,
        sha256: parsed.data.proofSha256 as string
      },
      resolveProofValidationPolicy(authConfig, rootDir)
    );

    if (proof.verification.status !== 'verified') {
      await buildOfficeSnapshot(paths, runId);
      throw new JuCliError('E_ARTIFACT_VERIFICATION_FAILED', 'Artifact proof verification failed', {
        taskId: task.taskId,
        proofId: proof.proofId,
        reasonCode: proof.verification.reasonCode
      });
    }

    task.proofIds = Array.from(new Set([...task.proofIds, proof.proofId]));

    const proofs = await listProofs(paths, runId);
    if (!canMarkTaskDone(task, proofs)) {
      throw new JuCliError('E_ARTIFACT_VERIFICATION_FAILED', 'Task cannot be marked done without a verified proof', {
        taskId: task.taskId
      });
    }

    task.status = 'done';
    task.updatedAt = nowIso();

    const verifiedProofCount = proofs.filter((candidate) => candidate.verification.status === 'verified').length;
    updatedRun = evaluateRunProgress(run, tasks, verifiedProofCount);

    taskUpdate = {
      taskId: task.taskId,
      status: task.status,
      proofId: proof.proofId
    };

    await writeTasks(paths, runId, tasks);
    await writeRun(paths, updatedRun);

    if (isTerminalRunStatus(updatedRun.status)) {
      await clearActiveRunLock(paths);
    }
  }

  const response: SuccessPayload = {
    ok: true,
    data: {
      eventId: event.eventId,
      ...(taskUpdate ? { taskUpdate } : {})
    }
  };

  await commitIdempotency(paths, runId, parsed.data.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  await buildOfficeSnapshot(paths, runId);

  return response;
}

async function processStop(rootDir: string, command: ParsedStopCommand): Promise<SuccessPayload> {
  const parsed = reasonValidationSchema.safeParse(command);
  if (!parsed.success) {
    parseValidationError(parsed.error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  await authorizeMutatingActor(paths, parsed.data.actor, parsed.data.authToken, 'stop', authConfig);
  await checkAndConsumeRateLimit(paths, parsed.data.actor, 'stop', resolvePerHourLimit(authConfig, 'stop'));

  const { runId, run } = await requireActiveRun(rootDir);
  requireNonTerminalRun(run, 'stop');

  const idempotency = await ensureIdempotency(paths, runId, parsed.data.idempotencyKey, command);
  if (idempotency.replay) {
    return idempotency.storedResponse as SuccessPayload;
  }

  const existingEvents = await readEvents(paths, runId);
  const event = await buildCommandEvent(
    runId,
    'stop',
    parsed.data.actor,
    { reason: parsed.data.reason },
    existingEvents.length
  );
  await appendEvent(paths, runId, event);

  const updatedRun = transitionRunForCommand(run, runId, 'stop', 'stopped', parsed.data.reason);
  await writeRun(paths, updatedRun);
  await clearActiveRunLock(paths);

  const response: SuccessPayload = {
    ok: true,
    data: {
      runId,
      status: 'stopped'
    }
  };

  await commitIdempotency(paths, runId, parsed.data.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  await buildOfficeSnapshot(paths, runId);

  return response;
}

async function processStatus(
  rootDir: string,
  runId?: ParsedStatusCommand['runId'],
  actor?: ParsedStatusCommand['actor'],
  authToken?: ParsedStatusCommand['authToken']
): Promise<SuccessPayload> {
  try {
    statusValidationSchema.parse({ runId, actor, authToken });
  } catch (error) {
    parseValidationError(error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  enforceStatusPolicy(authConfig, actor, authToken);

  const targetRunId = await resolveTargetRunId(rootDir, runId);
  if (!targetRunId) {
    const snapshot = await buildOfficeSnapshot(paths);
    return {
      ok: true,
      data: {
        run: null,
        snapshot
      }
    };
  }

  const [run, snapshot] = await Promise.all([readRun(paths, targetRunId), buildOfficeSnapshot(paths, targetRunId)]);

  return {
    ok: true,
    data: {
      run,
      snapshot
    }
  };
}

export async function processParsedCommand(parsed: ParsedCommand, rootDir = process.cwd()): Promise<SuccessPayload> {
  switch (parsed.command) {
    case 'start':
      return processStart(rootDir, parsed);
    case 'status':
      return processStatus(rootDir, parsed.runId, parsed.actor, parsed.authToken);
    case 'pause':
    case 'resume':
      return processPauseOrResume(rootDir, parsed);
    case 'reprioritize':
      return processReprioritize(rootDir, parsed);
    case 'message':
      return processMessage(rootDir, parsed);
    case 'stop':
      return processStop(rootDir, parsed);
    default:
      throw new JuCliError('E_USAGE', `Unsupported command ${(parsed as ParsedCommand).command}`);
  }
}

export async function processCommandFromArgv(argv: string[], rootDir = process.cwd()): Promise<SuccessPayload> {
  const parsed = parseCommand(argv);
  return processParsedCommand(parsed, rootDir);
}
