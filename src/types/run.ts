import type { z } from 'zod';

import type {
  autopilotPhaseSchema,
  autopilotQaResultSchema,
  autopilotReviewDecisionSchema,
  autopilotReviewSchema,
  autopilotStateSchema,
  personaSchema,
  runAutopilotSchema,
  runMetricsSchema,
  runSchema,
  runStatusSchema
} from '../contracts/run.contract.js';

export type RunStatus = z.infer<typeof runStatusSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type RunMetrics = z.infer<typeof runMetricsSchema>;
export type AutopilotPhase = z.infer<typeof autopilotPhaseSchema>;
export type AutopilotState = z.infer<typeof autopilotStateSchema>;
export type AutopilotQaResult = z.infer<typeof autopilotQaResultSchema>;
export type AutopilotReviewDecision = z.infer<typeof autopilotReviewDecisionSchema>;
export type AutopilotReview = z.infer<typeof autopilotReviewSchema>;
export type RunAutopilot = z.infer<typeof runAutopilotSchema>;
export type Run = z.infer<typeof runSchema>;
