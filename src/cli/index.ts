#!/usr/bin/env node
import { exitCodeByError, normalizeError, toErrorPayload } from '../core/error-codes.js';
import { processCommandFromArgv } from '../core/command-processor.js';

async function main(): Promise<void> {
  try {
    const response = await processCommandFromArgv(process.argv.slice(2), process.cwd());
    process.stdout.write(`${JSON.stringify(response)}\n`);
    process.exitCode = 0;
  } catch (error) {
    const normalized = normalizeError(error);
    const payload = toErrorPayload(normalized);
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = exitCodeByError[normalized.code] ?? 11;
  }
}

void main();
