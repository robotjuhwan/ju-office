import path from 'node:path';

export interface AppPaths {
  rootDir: string;
  dataDir: string;
  runsDir: string;
  locksDir: string;
  snapshotDir: string;
  snapshotLatestFile: string;
  runIndexFile: string;
  rateLimitFile: string;
  activeRunLockFile: string;
  docsDir: string;
  docsDataDir: string;
  docsSnapshotFile: string;
  artifactsDir: string;
  authConfigFile: string;
  plannerTemplatesFile: string;
  plannerKeywordRulesFile: string;
}

export function resolvePaths(rootDir = process.cwd()): AppPaths {
  const dataDir = path.join(rootDir, 'data');
  const runsDir = path.join(dataDir, 'runs');
  const locksDir = path.join(dataDir, 'locks');
  const snapshotDir = path.join(dataDir, 'snapshot');
  const docsDir = path.join(rootDir, 'docs');
  const docsDataDir = path.join(docsDir, 'data');
  const artifactsDir = path.join(rootDir, 'artifacts');

  return {
    rootDir,
    dataDir,
    runsDir,
    locksDir,
    snapshotDir,
    snapshotLatestFile: path.join(snapshotDir, 'latest.json'),
    runIndexFile: path.join(runsDir, 'index.json'),
    rateLimitFile: path.join(dataDir, 'rate-limits.json'),
    activeRunLockFile: path.join(locksDir, 'active-run.lock'),
    docsDir,
    docsDataDir,
    docsSnapshotFile: path.join(docsDataDir, 'snapshot.json'),
    artifactsDir,
    authConfigFile: path.join(rootDir, 'config', 'auth.json'),
    plannerTemplatesFile: path.join(rootDir, 'config', 'planner', 'templates.json'),
    plannerKeywordRulesFile: path.join(rootDir, 'config', 'planner', 'keyword-rules.json')
  };
}

export function runDir(paths: AppPaths, runId: string): string {
  return path.join(paths.runsDir, runId);
}

export function runFile(paths: AppPaths, runId: string): string {
  return path.join(runDir(paths, runId), 'run.json');
}

export function tasksFile(paths: AppPaths, runId: string): string {
  return path.join(runDir(paths, runId), 'tasks.json');
}

export function eventsFile(paths: AppPaths, runId: string): string {
  return path.join(runDir(paths, runId), 'events.ndjson');
}

export function proofsDir(paths: AppPaths, runId: string): string {
  return path.join(runDir(paths, runId), 'proofs');
}

export function proofFile(paths: AppPaths, runId: string, proofId: string): string {
  return path.join(proofsDir(paths, runId), `${proofId}.json`);
}

export function idempotencyFile(paths: AppPaths, runId: string): string {
  return path.join(runDir(paths, runId), 'idempotency.json');
}
