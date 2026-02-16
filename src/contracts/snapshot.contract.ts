import { z } from 'zod';

import { runStatusSchema } from './run.contract.js';
import { taskPrioritySchema, taskStatusSchema } from './task.contract.js';

export const snapshotStaleAfterSec = 300;

export const snapshotSchema = z.object({
  generatedAt: z.string().datetime(),
  staleAfterSec: z.number().int().positive(),
  runSummary: z.object({
    runId: z.string(),
    goal: z.string(),
    status: runStatusSchema,
    metrics: z.object({
      tasksTotal: z.number().int().nonnegative(),
      tasksDone: z.number().int().nonnegative(),
      proofsVerified: z.number().int().nonnegative()
    })
  }),
  orgView: z.array(
    z.object({
      personaId: z.string(),
      role: z.string(),
      assignmentCount: z.number().int().nonnegative(),
      objective: z.string()
    })
  ),
  taskBoard: z.array(
    z.object({
      taskId: z.string(),
      title: z.string(),
      status: taskStatusSchema,
      priority: taskPrioritySchema,
      ownerPersonaId: z.string(),
      proofIds: z.array(z.string())
    })
  ),
  commandFeed: z.array(
    z.object({
      eventId: z.string(),
      command: z.string(),
      actor: z.string(),
      timestamp: z.string().datetime()
    })
  ),
  artifactPanel: z.array(
    z.object({
      proofId: z.string(),
      taskId: z.string(),
      uri: z.string(),
      status: z.enum(['verified', 'rejected', 'pending']),
      reasonCode: z.string()
    })
  )
});
