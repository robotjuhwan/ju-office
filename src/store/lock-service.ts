import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ensureDir, exists } from '../utils/fs.js';
import type { AppPaths } from './paths.js';

export async function readActiveRunLock(paths: AppPaths): Promise<string | null> {
  if (!(await exists(paths.activeRunLockFile))) {
    return null;
  }
  const value = (await fs.readFile(paths.activeRunLockFile, 'utf8')).trim();
  return value || null;
}

export async function writeActiveRunLock(paths: AppPaths, runId: string): Promise<void> {
  await ensureDir(path.dirname(paths.activeRunLockFile));
  const handle = await fs.open(paths.activeRunLockFile, 'wx');
  try {
    await handle.writeFile(`${runId}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

export async function clearActiveRunLock(paths: AppPaths): Promise<void> {
  if (await exists(paths.activeRunLockFile)) {
    await fs.unlink(paths.activeRunLockFile);
  }
}
