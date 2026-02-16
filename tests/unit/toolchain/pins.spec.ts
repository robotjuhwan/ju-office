import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('toolchain pins', () => {
  it('pins exact versions and required scripts', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as Record<string, any>;

    expect(pkg.packageManager).toBe('npm@10.9.2');
    expect(pkg.engines.node).toBe('22.13.1');

    expect(pkg.devDependencies.typescript).toBe('5.6.3');
    expect(pkg.devDependencies.tsx).toBe('4.21.0');
    expect(pkg.devDependencies.vitest).toBe('2.1.9');
    expect(pkg.devDependencies.eslint).toBe('9.39.2');
    expect(pkg.devDependencies['@typescript-eslint/parser']).toBe('8.11.0');
    expect(pkg.devDependencies['@typescript-eslint/eslint-plugin']).toBe('8.11.0');
    expect(pkg.dependencies.zod).toBe('3.23.8');

    expect(pkg.scripts.ju).toBe('tsx src/cli/index.ts');
    expect(pkg.scripts['docs:build']).toBe('tsx scripts/build-docs.ts');
    expect(pkg.scripts.ci).toContain('npm run docs:validate');
  });
});
