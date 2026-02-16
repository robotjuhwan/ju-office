import type { ParsedResumeCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handleResume(command: ParsedResumeCommand, rootDir = process.cwd()): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
