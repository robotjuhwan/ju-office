import type { z } from 'zod';

import type { taskPrioritySchema, taskSchema, taskStatusSchema } from '../contracts/task.contract.js';

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type Task = z.infer<typeof taskSchema>;
