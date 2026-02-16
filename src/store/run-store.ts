import { exists, readJsonFile, readJsonFileOrDefault, writeJsonAtomic } from '../utils/fs.js';
import type { Run } from '../types/run.js';
import type { AppPaths } from './paths.js';
import { runFile } from './paths.js';

export async function readRunIndex(paths: AppPaths): Promise<string[]> {
  return readJsonFileOrDefault<string[]>(paths.runIndexFile, []);
}

export async function writeRunIndex(paths: AppPaths, runIds: string[]): Promise<void> {
  await writeJsonAtomic(paths.runIndexFile, runIds);
}

export async function appendRunIndex(paths: AppPaths, runId: string): Promise<void> {
  const runIds = await readRunIndex(paths);
  if (!runIds.includes(runId)) {
    runIds.push(runId);
  }
  await writeRunIndex(paths, runIds);
}

export async function readRun(paths: AppPaths, runId: string): Promise<Run | null> {
  const filePath = runFile(paths, runId);
  if (!(await exists(filePath))) {
    return null;
  }
  return readJsonFile<Run>(filePath);
}

export async function writeRun(paths: AppPaths, run: Run): Promise<void> {
  await writeJsonAtomic(runFile(paths, run.runId), run);
}
