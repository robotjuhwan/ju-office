import type { ParsedStatusCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handleStatus(command: ParsedStatusCommand, rootDir = process.cwd()): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
