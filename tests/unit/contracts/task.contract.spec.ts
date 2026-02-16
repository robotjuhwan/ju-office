import { describe, expect, it } from 'vitest';

import { taskSchema } from '../../../src/contracts/task.contract.js';

describe('task contract', () => {
  it('validates task IDs and priorities', () => {
    const parsed = taskSchema.parse({
      taskId: 'TASK-001',
      title: 'Task title',
      description: 'Task description',
      status: 'ready',
      priority: 'P1',
      ownerPersonaId: 'eng-001',
      proofIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    expect(parsed.taskId).toBe('TASK-001');
  });
});
