import type { ParsedStartCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handleStart(command: ParsedStartCommand, rootDir = process.cwd()): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
