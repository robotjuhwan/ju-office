import { z } from 'zod';

export const runIdPattern = /^run_[0-9]{8}T[0-9]{6}Z_[a-z0-9]{6}$/;

export const runStatusSchema = z.enum([
  'queued',
  'planning',
  'executing',
  'verifying',
  'paused',
  'blocked',
  'stopped',
  'failed',
  'completed'
]);

export const personaRoleSchema = z.enum(['CEO', 'CTO', 'PM', 'ENG', 'OPS']);

export const personaSchema = z.object({
  id: z.string().min(1),
  role: personaRoleSchema,
  model: z.string().min(1),
  specialty: z.string().min(1),
  objective: z.string().min(1)
});

export const runMetricsSchema = z.object({
  tasksTotal: z.number().int().nonnegative(),
  tasksDone: z.number().int().nonnegative(),
  proofsVerified: z.number().int().nonnegative()
});

export const autopilotPhaseSchema = z.enum(['expansion', 'planning', 'execution', 'qa', 'validation', 'complete']);

export const autopilotStateSchema = z.enum([
  'active',
  'awaiting_qa',
  'qa_failed',
  'awaiting_review',
  'rejected',
  'approved',
  'complete'
]);

export const autopilotQaResultSchema = z.enum(['pending', 'pass', 'fail']);

export const autopilotReviewDecisionSchema = z.enum(['pending', 'approve', 'reject']);

export const autopilotReviewSchema = z.object({
  decision: autopilotReviewDecisionSchema,
  summary: z.string().min(3).max(280).optional(),
  actor: z.string().min(1).optional(),
  updatedAt: z.string().datetime().optional()
});

export const runAutopilotSchema = z.object({
  phase: autopilotPhaseSchema,
  state: autopilotStateSchema,
  qa: z.object({
    result: autopilotQaResultSchema,
    cyclesCompleted: z.number().int().nonnegative(),
    maxCycles: z.number().int().positive(),
    repeatedFailureCount: z.number().int().nonnegative(),
    summary: z.string().min(3).max(280).optional(),
    failureSignature: z.string().min(3).max(160).optional(),
    actor: z.string().min(1).optional(),
    updatedAt: z.string().datetime().optional()
  }),
  validation: z.object({
    roundsCompleted: z.number().int().nonnegative(),
    maxRounds: z.number().int().positive()
  }),
  reviews: z.object({
    architect: autopilotReviewSchema,
    security: autopilotReviewSchema,
    code: autopilotReviewSchema
  }),
  planFiles: z.object({
    spec: z.string().min(1),
    implementation: z.string().min(1),
    checklist: z.string().min(1)
  }),
  updatedAt: z.string().datetime()
});

export const runSchema = z
  .object({
    runId: z.string().regex(runIdPattern),
    goal: z.string().min(10).max(280),
    status: runStatusSchema,
    personas: z.array(personaSchema).min(5).max(5),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    metrics: runMetricsSchema,
    pauseReason: z.string().optional(),
    blockedReason: z.string().optional(),
    stopReason: z.string().optional(),
    failureReason: z.string().optional(),
    autopilot: runAutopilotSchema.optional()
  })
  .superRefine((run, ctx) => {
    const ceoCount = run.personas.filter((persona) => persona.role === 'CEO').length;
    if (ceoCount !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Run must contain exactly one CEO persona' });
    }

    const workerCount = run.personas.filter((persona) => persona.role !== 'CEO').length;
    if (workerCount < 1 || workerCount > 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Run must contain one to four worker personas' });
    }
  });
