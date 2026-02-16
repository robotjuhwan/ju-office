import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { z } from 'zod';

import { canMarkTaskDone } from '../artifacts/proof-gate.js';
import { createAndVerifyProof } from '../artifacts/proof-service.js';
import { runIdPattern } from '../contracts/run.contract.js';
import { sha256Pattern } from '../contracts/proof.contract.js';
import { taskIdPattern, taskPrioritySchema } from '../contracts/task.contract.js';
import { parseCommand } from '../cli/parser.js';
import type {
  ParsedCommand,
  ParsedAutopilotCommand,
  ParsedMessageCommand,
  ParsedPauseCommand,
  ParsedQaCommand,
  ParsedReprioritizeCommand,
  ParsedReviewCommand,
  ParsedResumeCommand,
  ParsedSetupCommand,
  ParsedStartCommand,
  ParsedStatusCommand,
  ParsedStopCommand
} from '../cli/types.js';
import {
  canActorApproveReviewer,
  canActorReadStatus,
  isActorAuthorized,
  isAuthTokenValid,
  isStatusOpen,
  loadAuthConfig,
  resolveActorToken,
  resolveActorTokenEnvVar,
  resolvePerHourLimit,
  resolveProofValidationPolicy
} from './auth.js';
import { commitIdempotency, ensureIdempotency } from './idempotency.js';
import { JuCliError } from './error-codes.js';
import { checkAndConsumeRateLimit } from './rate-limit.js';
import { isTerminalRunStatus } from '../domain/run-lifecycle.js';
import {
  hasAutopilotCompletionApproval,
  hasQaEscalationFailure,
  hasValidationEscalationFailure,
  syncAutopilotLifecycle,
  syncAutopilotStateMirror
} from '../orchestration/autopilot-lifecycle.js';
import { evaluateRunProgress, initializeRun, transitionRun } from '../orchestration/run-engine.js';
import { buildOfficeSnapshot } from '../snapshot/builder.js';
import { appendEvent, readEvents } from '../store/event-log.js';
import { clearActiveRunLock, readActiveRunLock, writeActiveRunLock } from '../store/lock-service.js';
import { initStorage } from '../store/init-storage.js';
import { resolvePaths, runDir } from '../store/paths.js';
import { listProofs } from '../store/proof-store.js';
import { appendRunIndex, readRun, readRunIndex, writeRun } from '../store/run-store.js';
import { readTasks, writeTasks } from '../store/task-store.js';
import type { JuEvent } from '../types/event.js';
import type { Run } from '../types/run.js';
import { createEventId, createRunId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import { loadLocalEnvFile, readLocalEnv, writeLocalEnv } from './local-env.js';

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

const qaValidationSchema = z.object({
  result: z.enum(['pass', 'fail']),
  summary: z.string().min(3).max(280),
  failureSignature: z.string().min(3).max(160).optional(),
  actor: z.string().min(1),
  authToken: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const reviewValidationSchema = z.object({
  reviewer: z.enum(['architect', 'security', 'code']),
  decision: z.enum(['approve', 'reject']),
  summary: z.string().min(3).max(280),
  actor: z.string().min(1),
  authToken: z.string().min(1),
  idempotencyKey: z.string().min(1)
});

const MAX_RUN_DURATION_MINUTES = 240;
const MAX_RUN_DURATION_MS = MAX_RUN_DURATION_MINUTES * 60 * 1000;
const ACTIVE_LOCK_STALE_MS = 60_000;
const RUN_MUTATION_LOCK_TIMEOUT_MS = 5_000;
const RUN_MUTATION_LOCK_RETRY_MS = 50;
const RUN_MUTATION_LOCK_STALE_MS = 30_000;
const DISALLOWED_GOAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(?:malware|ransomware|spyware|botnet)\b/i, reason: 'malware operations are not allowed' },
  { pattern: /\b(?:phishing|credential\s*steal(?:er|ing)?|account\s*takeover)\b/i, reason: 'credential abuse is not allowed' },
  { pattern: /\b(?:ddos|denial[-\s]?of[-\s]?service)\b/i, reason: 'service disruption attacks are not allowed' },
  { pattern: /\b(?:exploit|zero[-\s]?day)\b/i, reason: 'offensive exploitation goals are not allowed' },
  { pattern: /\b(?:fraud|money\s*launder|stolen\s*card)\b/i, reason: 'financial abuse is not allowed' }
];
const MAX_AUTH_FAILURES_PER_HOUR = 12;
const DEFAULT_AUTOPILOT_ACTOR = 'investor-1';

interface SuccessPayload {
  ok: true;
  data: unknown;
}

function generateToken(length = 24): string {
  return randomBytes(length).toString('base64url');
}

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mutationLockPath(rootDir: string, runId: string): string {
  return path.join(runDir(resolvePaths(rootDir), runId), '.mutation.lock');
}

async function acquireRunMutationLock(rootDir: string, runId: string): Promise<string> {
  const lockPath = mutationLockPath(rootDir, runId);
  const startedAt = Date.now();

  while (true) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.close();
      return lockPath;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? ((error as { code: string }).code as string)
          : '';
      if (code !== 'EEXIST') {
        throw error;
      }
      const lockStat = await fs.stat(lockPath).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > RUN_MUTATION_LOCK_STALE_MS) {
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt > RUN_MUTATION_LOCK_TIMEOUT_MS) {
        throw new JuCliError('E_STORAGE_IO', 'Run mutation lock timeout', { runId });
      }
      await new Promise((resolve) => {
        setTimeout(resolve, RUN_MUTATION_LOCK_RETRY_MS);
      });
    }
  }
}

async function releaseRunMutationLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? ((error as { code: string }).code as string)
        : '';
    if (code !== 'ENOENT') {
      throw error;
    }
  }
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

function requireAutopilotMetadata(run: Run, command: 'qa' | 'review'): Run & { autopilot: NonNullable<Run['autopilot']> } {
  if (!run.autopilot) {
    throw new JuCliError('E_INVALID_TRANSITION', `Cannot ${command}: run ${run.runId} has no autopilot metadata`, {
      command,
      runId: run.runId
    });
  }

  return run as Run & { autopilot: NonNullable<Run['autopilot']> };
}

function requireVerifyingPhase(run: Run, command: 'qa' | 'review'): void {
  if (run.status !== 'verifying') {
    throw new JuCliError('E_INVALID_TRANSITION', `Cannot ${command} when run status is ${run.status}`, {
      command,
      runId: run.runId
    });
  }
}

function pendingReviewState() {
  return {
    architect: { decision: 'pending' as const },
    security: { decision: 'pending' as const },
    code: { decision: 'pending' as const }
  };
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

async function processSetup(rootDir: string, _command: ParsedSetupCommand): Promise<SuccessPayload> {
  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);

  const existingLocalEnv = await readLocalEnv(rootDir);
  const localEnvValues: Record<string, string> = {};
  let generatedCount = 0;
  let reusedCount = 0;
  let shellCount = 0;

  for (const envVarName of Object.values(authConfig.actorTokenEnv)) {
    const shellValue = process.env[envVarName];
    if (typeof shellValue === 'string' && shellValue.length > 0) {
      localEnvValues[envVarName] = shellValue;
      shellCount += 1;
      continue;
    }

    const existingValue = existingLocalEnv[envVarName];
    if (existingValue) {
      localEnvValues[envVarName] = existingValue;
      process.env[envVarName] = existingValue;
      reusedCount += 1;
      continue;
    }

    const generated = generateToken();
    localEnvValues[envVarName] = generated;
    process.env[envVarName] = generated;
    generatedCount += 1;
  }

  const envFilePath = await writeLocalEnv(rootDir, localEnvValues);

  return {
    ok: true,
    data: {
      envFile: path.relative(rootDir, envFilePath) || '.ju-office.env',
      tokenVars: Object.keys(localEnvValues).sort(),
      generatedCount,
      reusedCount,
      shellCount,
      next: [
        `npm run ju -- autopilot --goal "Build web snake game with keyboard controls and score"`,
        'npm run ju -- status'
      ]
    }
  };
}

async function processAutopilot(rootDir: string, command: ParsedAutopilotCommand): Promise<SuccessPayload> {
  const actor = command.actor ?? DEFAULT_AUTOPILOT_ACTOR;
  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);

  const authToken = command.authToken ?? resolveActorToken(authConfig, actor);
  if (!authToken) {
    const envVarName = resolveActorTokenEnvVar(authConfig, actor);
    const hint = envVarName
      ? `Missing auth token for actor ${actor}. Run "npm run ju -- setup" or set ${envVarName}.`
      : `Missing auth token for actor ${actor}. Run "npm run ju -- setup" first.`;
    throw new JuCliError('E_UNAUTHORIZED_ACTOR', hint, {
      actor,
      command: 'autopilot'
    });
  }

  const response = await processStart(rootDir, {
    command: 'start',
    goal: command.goal,
    actor,
    authToken,
    idempotencyKey: command.idempotencyKey ?? generateIdempotencyKey('autopilot-start')
  });

  return response;
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
    if (!activeRun) {
      const lockStat = await fs.stat(paths.activeRunLockFile).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs <= ACTIVE_LOCK_STALE_MS) {
        throw new JuCliError('E_ACTIVE_RUN_LOCK', `Run ${activeRunId} startup is still in progress`, {
          runId: activeRunId
        });
      }
    }
    await clearActiveRunLock(paths);
  }

  const runId = createRunId();

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

  let initialized;
  try {
    initialized = await initializeRun(command.goal, paths, runId);
  } catch (error) {
    try {
      await clearActiveRunLock(paths);
    } catch {
      // preserve original error
    }

    if (error instanceof Error && error.message.includes('outside 4..20')) {
      throw new JuCliError('E_CONTRACT_VALIDATION', error.message);
    }
    throw error;
  }

  const idempotency = await ensureIdempotency(paths, runId, command.idempotencyKey, command);
  if (idempotency.replay) {
    return idempotency.storedResponse as SuccessPayload;
  }

  let event: JuEvent | null = null;
  try {
    const existingEvents = await readEvents(paths, runId);
    event = await buildCommandEvent(runId, 'start', command.actor, { goal: command.goal }, existingEvents.length);
    await appendEvent(paths, runId, event);

    await writeRun(paths, initialized.run);
    await writeTasks(paths, runId, initialized.tasks);
    await appendRunIndex(paths, runId);
    await syncAutopilotStateMirror(paths, initialized.run);
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
  commandForBudget?: 'pause' | 'resume' | 'reprioritize' | 'message' | 'qa' | 'review'
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

  const nextStatus =
    command.command === 'pause'
      ? 'paused'
      : run.status === 'paused' && run.autopilot && ['qa', 'validation'].includes(run.autopilot.phase)
        ? 'verifying'
        : 'executing';
  const updatedRun = transitionRunForCommand(run, runId, command.command, nextStatus, parsed.data.reason);

  await writeRun(paths, updatedRun);
  await syncAutopilotStateMirror(paths, updatedRun);

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

    await syncAutopilotStateMirror(paths, updatedRun);
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

async function processQa(rootDir: string, command: ParsedQaCommand): Promise<SuccessPayload> {
  const parsed = qaValidationSchema.safeParse(command);
  if (!parsed.success) {
    parseValidationError(parsed.error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  await authorizeMutatingActor(paths, parsed.data.actor, parsed.data.authToken, 'qa', authConfig);
  await checkAndConsumeRateLimit(paths, parsed.data.actor, 'qa', resolvePerHourLimit(authConfig, 'qa'));

  const { runId, run } = await requireActiveRun(rootDir, 'qa');
  requireNonTerminalRun(run, 'qa');
  requireVerifyingPhase(run, 'qa');
  requireAutopilotMetadata(run, 'qa');

  const lockPath = await acquireRunMutationLock(rootDir, runId);
  let response: SuccessPayload | null = null;
  try {
    const idempotency = await ensureIdempotency(paths, runId, parsed.data.idempotencyKey, command);
    if (idempotency.replay) {
      return idempotency.storedResponse as SuccessPayload;
    }

    const latestRun = await readRun(paths, runId);
    if (!latestRun) {
      throw new JuCliError('E_STORAGE_IO', `Active run ${runId} could not be loaded`);
    }
    const latestAutopilotRun = requireAutopilotMetadata(latestRun, 'qa');
    requireVerifyingPhase(latestAutopilotRun, 'qa');

    const existingEvents = await readEvents(paths, runId);
    const event = await buildCommandEvent(
      runId,
      'qa',
      parsed.data.actor,
      {
        result: parsed.data.result,
        summary: parsed.data.summary,
        failureSignature: parsed.data.failureSignature
      },
      existingEvents.length
    );
    await appendEvent(paths, runId, event);

    const timestamp = nowIso();
    const currentQa = latestAutopilotRun.autopilot.qa;
    const nextCyclesCompleted = currentQa.cyclesCompleted + 1;
    const failureSignature =
      parsed.data.result === 'fail' ? (parsed.data.failureSignature ?? parsed.data.summary) : undefined;
    const repeatedFailureCount =
      parsed.data.result === 'fail'
        ? currentQa.failureSignature === failureSignature
          ? currentQa.repeatedFailureCount + 1
          : 1
        : 0;

    let updatedRun = syncAutopilotLifecycle({
      ...latestAutopilotRun,
      updatedAt: timestamp,
      autopilot: {
        ...latestAutopilotRun.autopilot,
        qa: {
          ...latestAutopilotRun.autopilot.qa,
          result: parsed.data.result,
          cyclesCompleted: nextCyclesCompleted,
          maxCycles: currentQa.maxCycles,
          repeatedFailureCount,
          summary: parsed.data.summary,
          ...(parsed.data.result === 'fail' ? { failureSignature } : { failureSignature: undefined }),
          actor: parsed.data.actor,
          updatedAt: timestamp
        },
        reviews: pendingReviewState(),
        updatedAt: timestamp
      }
    });

    const updatedAutopilot = updatedRun.autopilot;
    if (updatedAutopilot && hasQaEscalationFailure(updatedAutopilot)) {
      const reason =
        updatedAutopilot.qa.repeatedFailureCount >= 3
          ? `QA failed: same failure repeated ${updatedAutopilot.qa.repeatedFailureCount} times`
          : `QA failed: exceeded max cycles ${updatedAutopilot.qa.maxCycles}`;
      updatedRun = transitionRun(updatedRun, 'failed', reason);
    } else {
      const [tasks, proofs] = await Promise.all([readTasks(paths, runId), listProofs(paths, runId)]);
      const verifiedProofCount = proofs.filter((proof) => proof.verification.status === 'verified').length;
      updatedRun = evaluateRunProgress(updatedRun, tasks, verifiedProofCount);
    }

    await writeRun(paths, updatedRun);

    if (isTerminalRunStatus(updatedRun.status)) {
      await clearActiveRunLock(paths);
    }

    await syncAutopilotStateMirror(paths, updatedRun);
    response = {
      ok: true,
      data: {
        runId,
        status: updatedRun.status,
        qa: updatedRun.autopilot?.qa,
        autopilot: updatedRun.autopilot
          ? {
              phase: updatedRun.autopilot.phase,
              state: updatedRun.autopilot.state
            }
          : null
      }
    };
    await commitIdempotency(paths, runId, parsed.data.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  } finally {
    await releaseRunMutationLock(lockPath);
  }

  if (!response) {
    throw new JuCliError('E_STORAGE_IO', 'QA response could not be committed');
  }
  await buildOfficeSnapshot(paths, runId);

  return response;
}

async function processReview(rootDir: string, command: ParsedReviewCommand): Promise<SuccessPayload> {
  const parsed = reviewValidationSchema.safeParse(command);
  if (!parsed.success) {
    parseValidationError(parsed.error);
  }

  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  const authConfig = await loadAuthConfig(paths.authConfigFile);
  await authorizeMutatingActor(paths, parsed.data.actor, parsed.data.authToken, 'review', authConfig);
  await checkAndConsumeRateLimit(paths, parsed.data.actor, 'review', resolvePerHourLimit(authConfig, 'review'));
  if (!canActorApproveReviewer(authConfig, parsed.data.actor, parsed.data.reviewer)) {
    throw new JuCliError(
      'E_UNAUTHORIZED_ACTOR',
      `Actor ${parsed.data.actor} is not authorized to approve reviewer role ${parsed.data.reviewer}`,
      {
        actor: parsed.data.actor,
        reviewer: parsed.data.reviewer,
        command: 'review'
      }
    );
  }

  const { runId, run } = await requireActiveRun(rootDir, 'review');
  requireNonTerminalRun(run, 'review');
  requireVerifyingPhase(run, 'review');
  requireAutopilotMetadata(run, 'review');

  const lockPath = await acquireRunMutationLock(rootDir, runId);
  let response: SuccessPayload | null = null;
  try {
    const idempotency = await ensureIdempotency(paths, runId, parsed.data.idempotencyKey, command);
    if (idempotency.replay) {
      return idempotency.storedResponse as SuccessPayload;
    }

    const latestRun = await readRun(paths, runId);
    if (!latestRun) {
      throw new JuCliError('E_STORAGE_IO', `Active run ${runId} could not be loaded`);
    }
    const latestAutopilotRun = requireAutopilotMetadata(latestRun, 'review');
    requireVerifyingPhase(latestAutopilotRun, 'review');

    if (latestAutopilotRun.autopilot.qa.result !== 'pass') {
      throw new JuCliError('E_INVALID_TRANSITION', 'Cannot review before QA has passed', {
        command: 'review',
        runId
      });
    }

    const existingEvents = await readEvents(paths, runId);
    const event = await buildCommandEvent(
      runId,
      'review',
      parsed.data.actor,
      {
        reviewer: parsed.data.reviewer,
        decision: parsed.data.decision,
        summary: parsed.data.summary
      },
      existingEvents.length
    );
    await appendEvent(paths, runId, event);

    const timestamp = nowIso();
    const currentAutopilot = latestAutopilotRun.autopilot;

    let updatedRun: Run;
    if (parsed.data.decision === 'reject') {
      updatedRun = syncAutopilotLifecycle({
        ...latestAutopilotRun,
        updatedAt: timestamp,
        autopilot: {
          ...currentAutopilot,
          qa: {
            ...currentAutopilot.qa,
            result: 'pending',
            summary: parsed.data.summary,
            failureSignature: undefined,
            actor: parsed.data.actor,
            updatedAt: timestamp,
            repeatedFailureCount: 0
          },
          validation: {
            ...currentAutopilot.validation,
            roundsCompleted: currentAutopilot.validation.roundsCompleted + 1
          },
          reviews: {
            ...pendingReviewState(),
            [parsed.data.reviewer]: {
              decision: 'reject',
              summary: parsed.data.summary,
              actor: parsed.data.actor,
              updatedAt: timestamp
            }
          },
          updatedAt: timestamp
        }
      });
    } else {
      updatedRun = syncAutopilotLifecycle({
        ...latestAutopilotRun,
        updatedAt: timestamp,
        autopilot: {
          ...currentAutopilot,
          reviews: {
            ...currentAutopilot.reviews,
            [parsed.data.reviewer]: {
              decision: parsed.data.decision,
              summary: parsed.data.summary,
              actor: parsed.data.actor,
              updatedAt: timestamp
            }
          },
          updatedAt: timestamp
        }
      });
    }

    const updatedAutopilot = updatedRun.autopilot;
    if (parsed.data.decision === 'reject' && updatedAutopilot && hasValidationEscalationFailure(updatedAutopilot)) {
      updatedRun = transitionRun(
        updatedRun,
        'failed',
        `Validation rejected too many times (${updatedAutopilot.validation.roundsCompleted}/${updatedAutopilot.validation.maxRounds})`
      );
    } else {
      const [tasks, proofs] = await Promise.all([readTasks(paths, runId), listProofs(paths, runId)]);
      const verifiedProofCount = proofs.filter((proof) => proof.verification.status === 'verified').length;
      updatedRun = evaluateRunProgress(updatedRun, tasks, verifiedProofCount);
    }

    await writeRun(paths, updatedRun);

    if (isTerminalRunStatus(updatedRun.status)) {
      await clearActiveRunLock(paths);
    }

    await syncAutopilotStateMirror(paths, updatedRun);
    response = {
      ok: true,
      data: {
        runId,
        status: updatedRun.status,
        reviewer: parsed.data.reviewer,
        decision: parsed.data.decision,
        completionApproved: updatedRun.autopilot ? hasAutopilotCompletionApproval(updatedRun.autopilot) : false
      }
    };
    await commitIdempotency(paths, runId, parsed.data.idempotencyKey, idempotency.payloadHash, response, idempotency.map);
  } finally {
    await releaseRunMutationLock(lockPath);
  }

  if (!response) {
    throw new JuCliError('E_STORAGE_IO', 'Review response could not be committed');
  }
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
  await syncAutopilotStateMirror(paths, updatedRun);

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
  const localEnv = await readLocalEnv(rootDir);
  const shouldUseSetupDefaults = Object.keys(localEnv).length > 0;
  const resolvedActor =
    actor ?? (isStatusOpen(authConfig) || !shouldUseSetupDefaults ? undefined : DEFAULT_AUTOPILOT_ACTOR);
  const resolvedAuthToken =
    authToken ?? (resolvedActor ? (resolveActorToken(authConfig, resolvedActor) ?? undefined) : undefined);
  enforceStatusPolicy(authConfig, resolvedActor, resolvedAuthToken);

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
    case 'setup':
      return processSetup(rootDir, parsed);
    case 'autopilot':
      return processAutopilot(rootDir, parsed);
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
    case 'qa':
      return processQa(rootDir, parsed);
    case 'review':
      return processReview(rootDir, parsed);
    case 'stop':
      return processStop(rootDir, parsed);
    default:
      throw new JuCliError('E_USAGE', `Unsupported command ${(parsed as ParsedCommand).command}`);
  }
}

export async function processCommandFromArgv(argv: string[], rootDir = process.cwd()): Promise<SuccessPayload> {
  await loadLocalEnvFile(rootDir);
  const parsed = parseCommand(argv);
  return processParsedCommand(parsed, rootDir);
}
