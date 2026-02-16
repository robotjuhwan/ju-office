import type { z } from 'zod';

import type { personaSchema, runMetricsSchema, runSchema, runStatusSchema } from '../contracts/run.contract.js';

export type RunStatus = z.infer<typeof runStatusSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type RunMetrics = z.infer<typeof runMetricsSchema>;
export type Run = z.infer<typeof runSchema>;
