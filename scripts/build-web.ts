import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { ensureDir } from '../src/utils/fs.js';

async function transpileWebApp(appTsPath: string, outJsPath: string): Promise<void> {
  const source = await fs.readFile(appTsPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
      removeComments: false
    }
  });

  await fs.writeFile(outJsPath, transpiled.outputText, 'utf8');
}

export async function runBuildWeb(rootDir = process.cwd()): Promise<void> {
  const docsDir = path.join(rootDir, 'docs');
  const docsAssetsDir = path.join(docsDir, 'assets');
  await ensureDir(docsAssetsDir);

  const webDir = path.join(rootDir, 'web');
  const indexHtml = await fs.readFile(path.join(webDir, 'index.html'), 'utf8');
  const stylesCss = await fs.readFile(path.join(webDir, 'styles.css'), 'utf8');

  await fs.writeFile(path.join(docsDir, 'index.html'), indexHtml, 'utf8');
  await fs.writeFile(path.join(docsAssetsDir, 'styles.css'), stylesCss, 'utf8');

  await transpileWebApp(path.join(webDir, 'app.ts'), path.join(docsAssetsDir, 'app.js'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBuildWeb().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
