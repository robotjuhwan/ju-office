import { runBuildDocs } from './build-docs.js';

export async function runPublishDocs(rootDir = process.cwd()): Promise<void> {
  await runBuildDocs(rootDir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPublishDocs().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
