import type { ParsedPauseCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handlePause(command: ParsedPauseCommand, rootDir = process.cwd()): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
