import { describe, expect, it } from 'vitest';

import { cliErrorSchema } from '../../../src/contracts/cli-error.contract.js';

describe('cli error contract', () => {
  it('validates standard error payload', () => {
    const parsed = cliErrorSchema.parse({
      ok: false,
      error: {
        code: 'E_INVALID_TRANSITION',
        message: 'Cannot resume when run status is executing',
        details: { command: 'resume' }
      }
    });

    expect(parsed.error.code).toBe('E_INVALID_TRANSITION');
  });
});
