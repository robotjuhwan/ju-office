import type { ParsedStopCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handleStop(command: ParsedStopCommand, rootDir = process.cwd()): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
