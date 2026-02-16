import { z } from 'zod';

import { eventSchema } from '../contracts/event.contract.js';
import { appendNdjson, readNdjson } from '../utils/fs.js';
import { JuCliError } from '../core/error-codes.js';
import type { JuEvent } from '../types/event.js';
import type { AppPaths } from './paths.js';
import { eventsFile } from './paths.js';

export async function appendEvent(paths: AppPaths, runId: string, event: JuEvent): Promise<void> {
  try {
    const parsed = eventSchema.parse(event);
    await appendNdjson(eventsFile(paths, runId), parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new JuCliError(
        'E_CONTRACT_VALIDATION',
        `Event contract validation failed: ${error.issues.map((issue) => issue.message).join('; ')}`
      );
    }
    throw error;
  }
}

export async function readEvents(paths: AppPaths, runId: string): Promise<JuEvent[]> {
  return readNdjson<JuEvent>(eventsFile(paths, runId));
}
