import type { ParsedMessageCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handleMessage(command: ParsedMessageCommand, rootDir = process.cwd()): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
