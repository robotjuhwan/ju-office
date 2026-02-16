import { z } from 'zod';

export const eventSchema = z.object({
  eventId: z.string().min(1),
  runId: z.string().min(1),
  type: z.enum(['command', 'internal']),
  command: z.string().min(1),
  actor: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown())
});
