import { promises as fs } from 'node:fs';
import path from 'node:path';

import { snapshotSchema } from '../src/contracts/snapshot.contract.js';

async function assertExists(filePath: string): Promise<void> {
  await fs.access(filePath);
}

async function assertNonEmpty(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    throw new Error(`Expected non-empty file: ${filePath}`);
  }
}

export async function runValidateDocsArtifacts(rootDir = process.cwd()): Promise<void> {
  const docsDir = path.join(rootDir, 'docs');
  const requiredFiles = [
    path.join(docsDir, 'index.html'),
    path.join(docsDir, 'assets', 'app.js'),
    path.join(docsDir, 'assets', 'styles.css'),
    path.join(docsDir, 'data', 'snapshot.json'),
    path.join(docsDir, 'contracts', 'run.md'),
    path.join(docsDir, 'contracts', 'task.md'),
    path.join(docsDir, 'contracts', 'proof.md'),
    path.join(docsDir, 'contracts', 'snapshot.md'),
    path.join(docsDir, 'contracts', 'event.md'),
    path.join(docsDir, 'contracts', 'cli-error.md'),
    path.join(docsDir, 'mvp-scope.md')
  ];

  for (const filePath of requiredFiles) {
    await assertExists(filePath);
  }

  await assertNonEmpty(path.join(docsDir, 'assets', 'app.js'));

  const snapshotRaw = await fs.readFile(path.join(docsDir, 'data', 'snapshot.json'), 'utf8');
  const snapshot = JSON.parse(snapshotRaw) as unknown;
  snapshotSchema.parse(snapshot);

  const indexRaw = await fs.readFile(path.join(docsDir, 'index.html'), 'utf8');
  if (!indexRaw.includes('./assets/app.js') || !indexRaw.includes('./assets/styles.css')) {
    throw new Error('docs/index.html must reference built app.js and styles.css assets');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runValidateDocsArtifacts().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
