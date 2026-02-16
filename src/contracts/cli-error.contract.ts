import { z } from 'zod';

export const cliErrorCodeSchema = z.enum([
  'E_USAGE',
  'E_CONTRACT_VALIDATION',
  'E_UNAUTHORIZED_ACTOR',
  'E_RATE_LIMIT_EXCEEDED',
  'E_IDEMPOTENCY_CONFLICT',
  'E_INVALID_TRANSITION',
  'E_ACTIVE_RUN_LOCK',
  'E_STORAGE_IO',
  'E_ARTIFACT_VERIFICATION_FAILED',
  'E_INTERNAL'
]);

export const cliErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: cliErrorCodeSchema,
    message: z.string(),
    details: z.record(z.unknown()).optional()
  })
});
