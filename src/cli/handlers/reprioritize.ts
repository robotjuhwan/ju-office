import type { ParsedReprioritizeCommand } from '../types.js';
import { processParsedCommand } from '../../core/command-processor.js';

export async function handleReprioritize(
  command: ParsedReprioritizeCommand,
  rootDir = process.cwd()
): Promise<{ ok: true; data: unknown }> {
  return processParsedCommand(command, rootDir);
}
