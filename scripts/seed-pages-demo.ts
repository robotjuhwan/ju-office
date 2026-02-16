import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { sha256Hex } from '../src/artifacts/hash.js';
import { processCommandFromArgv } from '../src/core/command-processor.js';
import { JuCliError } from '../src/core/error-codes.js';
import { resolvePaths } from '../src/store/paths.js';
import { readTasks } from '../src/store/task-store.js';
import { ensureDir } from '../src/utils/fs.js';

const DEFAULT_INVESTOR_TOKEN = 'pages-seed-investor-1';
const DEFAULT_CEO_TOKEN = 'pages-seed-ceo-001';

const startResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    runId: z.string().min(1)
  })
});

function resolveToken(envName: 'JU_ACTOR_TOKEN_INVESTOR_1' | 'JU_ACTOR_TOKEN_CEO_001', fallback: string): string {
  process.env[envName] ??= fallback;
  const resolved = process.env[envName];
  if (!resolved || resolved.length === 0) {
    throw new Error(`${envName} is required for pages demo seeding`);
  }
  return resolved;
}

function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function startRun(rootDir: string, investorToken: string): Promise<string> {
  const startArgs = [
    'start',
    '--goal',
    'Seed GitHub Pages demo run with verified local proof artifact visibility',
    '--actor',
    'investor-1',
    '--auth-token',
    investorToken,
    '--idempotency-key',
    createIdempotencyKey('pages-seed-start')
  ];

  try {
    const response = await processCommandFromArgv(startArgs, rootDir);
    return startResponseSchema.parse(response).data.runId;
  } catch (error) {
    if (!(error instanceof JuCliError) || error.code !== 'E_ACTIVE_RUN_LOCK') {
      throw error;
    }

    await processCommandFromArgv(
      [
        'stop',
        '--reason',
        'Reset active run before pages demo seeding',
        '--actor',
        'investor-1',
        '--auth-token',
        investorToken,
        '--idempotency-key',
        createIdempotencyKey('pages-seed-stop')
      ],
      rootDir
    );

    const retried = await processCommandFromArgv(
      [
        'start',
        '--goal',
        'Seed GitHub Pages demo run with verified local proof artifact visibility',
        '--actor',
        'investor-1',
        '--auth-token',
        investorToken,
        '--idempotency-key',
        createIdempotencyKey('pages-seed-start-retry')
      ],
      rootDir
    );
    return startResponseSchema.parse(retried).data.runId;
  }
}

export interface SeedPagesDemoResult {
  runId: string;
  taskId: string;
  proofUri: string;
}

export async function runSeedPagesDemo(rootDir = process.cwd()): Promise<SeedPagesDemoResult> {
  const investorToken = resolveToken('JU_ACTOR_TOKEN_INVESTOR_1', DEFAULT_INVESTOR_TOKEN);
  const ceoToken = resolveToken('JU_ACTOR_TOKEN_CEO_001', DEFAULT_CEO_TOKEN);

  const runId = await startRun(rootDir, investorToken);
  const paths = resolvePaths(rootDir);
  const tasks = await readTasks(paths, runId);
  const targetTask = tasks.find((task) => /proof|demo/i.test(task.title)) ?? tasks[0];

  if (!targetTask) {
    throw new Error(`No tasks available for seeded run ${runId}`);
  }

  const artifactsDir = path.join(rootDir, 'artifacts');
  const seedArtifactsDir = path.join(artifactsDir, 'pages-demo');
  await ensureDir(seedArtifactsDir);
  const artifactPath = path.join(seedArtifactsDir, `${runId}-${targetTask.taskId}.txt`);
  const artifactContent = Buffer.from(
    [
      'Ju Office GitHub Pages demo proof artifact',
      `runId=${runId}`,
      `taskId=${targetTask.taskId}`,
      `seededAt=${new Date().toISOString()}`
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(artifactPath, artifactContent, 'utf8');
  const proofUri = pathToFileURL(artifactPath).href;
  const proofSha256 = sha256Hex(artifactContent);

  await processCommandFromArgv(
    [
      'message',
      '--to',
      'ceo',
      '--text',
      'GitHub Pages demo proof artifact uploaded',
      '--task-id',
      targetTask.taskId,
      '--proof-uri',
      proofUri,
      '--proof-sha256',
      proofSha256,
      '--complete-task',
      '--actor',
      'ceo-001',
      '--auth-token',
      ceoToken,
      '--idempotency-key',
      createIdempotencyKey('pages-seed-complete')
    ],
    rootDir
  );

  return { runId, taskId: targetTask.taskId, proofUri };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeedPagesDemo()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ ok: true, data: result })}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
