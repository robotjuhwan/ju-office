import { z } from 'zod';

export const taskIdPattern = /^TASK-[0-9]{3}$/;

export const taskStatusSchema = z.enum([
  'backlog',
  'ready',
  'in_progress',
  'blocked',
  'done',
  'failed',
  'cancelled'
]);

export const taskPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);

export const taskSchema = z.object({
  taskId: z.string().regex(taskIdPattern),
  title: z.string().min(3),
  description: z.string().min(5),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  ownerPersonaId: z.string().min(1),
  proofIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
