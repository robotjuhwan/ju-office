export type ErrorCode =
  | 'E_USAGE'
  | 'E_CONTRACT_VALIDATION'
  | 'E_UNAUTHORIZED_ACTOR'
  | 'E_RATE_LIMIT_EXCEEDED'
  | 'E_IDEMPOTENCY_CONFLICT'
  | 'E_INVALID_TRANSITION'
  | 'E_ACTIVE_RUN_LOCK'
  | 'E_STORAGE_IO'
  | 'E_ARTIFACT_VERIFICATION_FAILED'
  | 'E_INTERNAL';

export const exitCodeByError: Record<ErrorCode, number> = {
  E_USAGE: 2,
  E_CONTRACT_VALIDATION: 3,
  E_UNAUTHORIZED_ACTOR: 4,
  E_RATE_LIMIT_EXCEEDED: 5,
  E_IDEMPOTENCY_CONFLICT: 6,
  E_INVALID_TRANSITION: 7,
  E_ACTIVE_RUN_LOCK: 8,
  E_STORAGE_IO: 9,
  E_ARTIFACT_VERIFICATION_FAILED: 10,
  E_INTERNAL: 11
};

export class JuCliError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'JuCliError';
    this.code = code;
    this.details = details;
  }
}

const INTERNAL_ERROR_MESSAGE = 'Internal error';
const STORAGE_IO_MESSAGE = 'Storage I/O error';

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'code' in value &&
      typeof (value as NodeJS.ErrnoException).code === 'string'
  );
}

export function toErrorPayload(error: JuCliError): {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
} {
  const isInternal = error.code === 'E_INTERNAL';
  const message = isInternal ? INTERNAL_ERROR_MESSAGE : error.message;
  return {
    ok: false,
    error: {
      code: error.code,
      message,
      ...(!isInternal && error.details ? { details: error.details } : {})
    }
  };
}

export function normalizeError(error: unknown): JuCliError {
  if (error instanceof JuCliError) {
    if (error.code === 'E_INTERNAL') {
      return new JuCliError('E_INTERNAL', INTERNAL_ERROR_MESSAGE);
    }
    return error;
  }
  if (isErrnoException(error)) {
    return new JuCliError('E_STORAGE_IO', STORAGE_IO_MESSAGE, {
      reason: error.code
    });
  }
  if (error instanceof Error) {
    if (error.message === 'IDEMPOTENCY_CONFLICT') {
      return new JuCliError('E_IDEMPOTENCY_CONFLICT', 'Idempotency key is already bound to a different payload');
    }
    if (error.message === 'RATE_LIMIT_EXCEEDED') {
      return new JuCliError('E_RATE_LIMIT_EXCEEDED', 'Mutating command rate limit exceeded');
    }
    if (error.message.startsWith('Invalid run transition')) {
      return new JuCliError('E_INVALID_TRANSITION', error.message);
    }

    return new JuCliError('E_INTERNAL', INTERNAL_ERROR_MESSAGE);
  }
  return new JuCliError('E_INTERNAL', INTERNAL_ERROR_MESSAGE);
}
