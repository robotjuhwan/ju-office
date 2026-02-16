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
    failureReason: z.string().optional()
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
