import { z } from 'zod';

import {
  autopilotPhaseSchema,
  autopilotQaResultSchema,
  autopilotReviewDecisionSchema,
  autopilotStateSchema,
  runStatusSchema
} from './run.contract.js';
import { taskPrioritySchema, taskStatusSchema } from './task.contract.js';

export const snapshotStaleAfterSec = 300;

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

export const snapshotOrgCharacterSchema = z.object({
  avatar: z.string().min(1),
  style: z.string().min(1),
  accentColor: z.string().regex(hexColorPattern)
});

export const snapshotOrgCoordinatesSchema = z.object({
  xPct: z.number().int().min(0).max(100),
  yPct: z.number().int().min(0).max(100),
  zone: z.string().min(1),
  room: z.string().min(1)
});

export const snapshotOrgPersonaSchema = z.object({
  personaId: z.string(),
  role: z.string(),
  assignmentCount: z.number().int().nonnegative(),
  objective: z.string(),
  character: snapshotOrgCharacterSchema,
  coordinates: snapshotOrgCoordinatesSchema
});

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
    }),
    autopilot: z
      .object({
        phase: autopilotPhaseSchema,
        state: autopilotStateSchema,
        qaResult: autopilotQaResultSchema,
        qaCyclesCompleted: z.number().int().nonnegative(),
        qaMaxCycles: z.number().int().positive(),
        validationRoundsCompleted: z.number().int().nonnegative(),
        validationMaxRounds: z.number().int().positive(),
        approvals: z.object({
          architect: autopilotReviewDecisionSchema,
          security: autopilotReviewDecisionSchema,
          code: autopilotReviewDecisionSchema
        })
      })
      .optional()
  }),
  orgView: z.array(snapshotOrgPersonaSchema),
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
