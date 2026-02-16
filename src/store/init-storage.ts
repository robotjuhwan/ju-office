import { ensureDir, exists, writeJsonAtomic } from '../utils/fs.js';
import type { AppPaths } from './paths.js';

export async function initStorage(paths: AppPaths): Promise<void> {
  await ensureDir(paths.dataDir);
  await ensureDir(paths.runsDir);
  await ensureDir(paths.locksDir);
  await ensureDir(paths.snapshotDir);
  await ensureDir(paths.omxDir);
  await ensureDir(paths.omxPlansDir);
  await ensureDir(paths.omxStateDir);
  await ensureDir(paths.docsDir);
  await ensureDir(paths.docsDataDir);
  await ensureDir(paths.artifactsDir);

  if (!(await exists(paths.runIndexFile))) {
    await writeJsonAtomic(paths.runIndexFile, [] as string[]);
  }

  if (!(await exists(paths.rateLimitFile))) {
    await writeJsonAtomic(paths.rateLimitFile, {});
  }
}
