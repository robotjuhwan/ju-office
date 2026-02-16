import { describe, expect, it } from 'vitest';

import { artifactProofSchema } from '../../../src/contracts/proof.contract.js';

describe('proof contract', () => {
  it('accepts verified proof shape', () => {
    const parsed = artifactProofSchema.parse({
      proofId: 'PRF-001',
      taskId: 'TASK-001',
      uri: 'file:///tmp/proof.txt',
      sha256: 'a'.repeat(64),
      verification: {
        status: 'verified',
        reasonCode: 'E_NONE',
        verifiedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    expect(parsed.verification.status).toBe('verified');
  });
});
