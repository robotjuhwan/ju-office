import { initStorage } from '../src/store/init-storage.js';
import { resolvePaths } from '../src/store/paths.js';
import { buildOfficeSnapshot } from '../src/snapshot/builder.js';

export async function runBuildSnapshot(rootDir = process.cwd()): Promise<void> {
  const paths = resolvePaths(rootDir);
  await initStorage(paths);
  await buildOfficeSnapshot(paths);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuildSnapshot().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
