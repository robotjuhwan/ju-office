import { describe, expect, it } from 'vitest';

import { JuCliError, exitCodeByError, normalizeError, toErrorPayload } from '../../../src/core/error-codes.js';

describe('error code mapping', () => {
  it('maps errors to expected exit codes', () => {
    expect(exitCodeByError.E_USAGE).toBe(2);
    expect(exitCodeByError.E_CONTRACT_VALIDATION).toBe(3);
    expect(exitCodeByError.E_UNAUTHORIZED_ACTOR).toBe(4);
    expect(exitCodeByError.E_RATE_LIMIT_EXCEEDED).toBe(5);
    expect(exitCodeByError.E_IDEMPOTENCY_CONFLICT).toBe(6);
    expect(exitCodeByError.E_INVALID_TRANSITION).toBe(7);
    expect(exitCodeByError.E_ACTIVE_RUN_LOCK).toBe(8);
    expect(exitCodeByError.E_STORAGE_IO).toBe(9);
    expect(exitCodeByError.E_ARTIFACT_VERIFICATION_FAILED).toBe(10);
    expect(exitCodeByError.E_INTERNAL).toBe(11);
  });

  it('formats stderr payload contract', () => {
    const error = new JuCliError('E_INVALID_TRANSITION', 'Cannot resume when run status is executing', {
      command: 'resume',
      runId: 'run_20260216T093000Z_ab12cd'
    });

    expect(toErrorPayload(error)).toEqual({
      ok: false,
      error: {
        code: 'E_INVALID_TRANSITION',
        message: 'Cannot resume when run status is executing',
        details: {
          command: 'resume',
          runId: 'run_20260216T093000Z_ab12cd'
        }
      }
    });
  });

  it('sanitizes unhandled internal errors', () => {
    const normalized = normalizeError(new Error('sensitive internals leaked'));

    expect(normalized.code).toBe('E_INTERNAL');
    expect(toErrorPayload(normalized)).toEqual({
      ok: false,
      error: {
        code: 'E_INTERNAL',
        message: 'Internal error'
      }
    });
  });
});
