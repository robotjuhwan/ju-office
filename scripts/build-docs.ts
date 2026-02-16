import { promises as fs } from 'node:fs';
import path from 'node:path';

import { runBuildSnapshot } from './build-snapshot.js';
import { runBuildWeb } from './build-web.js';
import { ensureDir } from '../src/utils/fs.js';

const requiredContractDocs = ['run.md', 'task.md', 'proof.md', 'snapshot.md', 'event.md', 'cli-error.md'];

export async function runBuildDocs(rootDir = process.cwd()): Promise<void> {
  await runBuildSnapshot(rootDir);
  await runBuildWeb(rootDir);

  const docsDataDir = path.join(rootDir, 'docs', 'data');
  await ensureDir(docsDataDir);

  const snapshotSource = path.join(rootDir, 'data', 'snapshot', 'latest.json');
  const snapshotTarget = path.join(docsDataDir, 'snapshot.json');
  const snapshotRaw = await fs.readFile(snapshotSource, 'utf8');
  await fs.writeFile(snapshotTarget, snapshotRaw, 'utf8');

  const contractsDir = path.join(rootDir, 'docs', 'contracts');
  await ensureDir(contractsDir);

  for (const fileName of requiredContractDocs) {
    const fullPath = path.join(contractsDir, fileName);
    await fs.access(fullPath);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuildDocs().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
