import { JuCliError } from '../core/error-codes.js';
import type { ParsedCommand } from './types.js';

interface CommandSpec {
  required: string[];
  optional: string[];
  boolean?: string[];
}

const commandSpecs: Record<string, CommandSpec> = {
  start: {
    required: ['goal', 'actor', 'auth-token', 'idempotency-key'],
    optional: [],
    boolean: []
  },
  status: {
    required: [],
    optional: ['run-id', 'actor', 'auth-token'],
    boolean: []
  },
  pause: {
    required: ['reason', 'actor', 'auth-token', 'idempotency-key'],
    optional: [],
    boolean: []
  },
  resume: {
    required: ['reason', 'actor', 'auth-token', 'idempotency-key'],
    optional: [],
    boolean: []
  },
  reprioritize: {
    required: ['task-id', 'priority', 'reason', 'actor', 'auth-token', 'idempotency-key'],
    optional: [],
    boolean: []
  },
  message: {
    required: ['to', 'text', 'actor', 'auth-token', 'idempotency-key'],
    optional: ['task-id', 'proof-uri', 'proof-sha256'],
    boolean: ['complete-task']
  },
  stop: {
    required: ['reason', 'actor', 'auth-token', 'idempotency-key'],
    optional: [],
    boolean: []
  }
};

function parseFlags(tokens: string[], spec: CommandSpec): Map<string, string | boolean> {
  const allowedFlags = new Set<string>([...spec.required, ...spec.optional, ...(spec.boolean ?? [])]);
  const booleanFlags = new Set<string>(spec.boolean ?? []);

  const parsed = new Map<string, string | boolean>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) {
      throw new JuCliError('E_USAGE', `Unexpected token: ${token}`);
    }

    const name = token.slice(2);
    if (!allowedFlags.has(name)) {
      throw new JuCliError('E_USAGE', `Unknown flag: --${name}`);
    }

    if (booleanFlags.has(name)) {
      parsed.set(name, true);
      continue;
    }

    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) {
      throw new JuCliError('E_USAGE', `Missing value for --${name}`);
    }

    parsed.set(name, value);
    index += 1;
  }

  for (const required of spec.required) {
    if (!parsed.has(required)) {
      throw new JuCliError('E_USAGE', `Missing required flag --${required}`);
    }
  }

  return parsed;
}

function getString(flags: Map<string, string | boolean>, name: string): string {
  const value = flags.get(name);
  if (typeof value !== 'string') {
    throw new JuCliError('E_USAGE', `Missing required flag --${name}`);
  }
  return value;
}

export function parseCommand(argv: string[]): ParsedCommand {
  if (argv.length === 0) {
    throw new JuCliError('E_USAGE', 'Missing command');
  }

  const [command, ...rest] = argv;
  const spec = commandSpecs[command];
  if (!spec) {
    throw new JuCliError('E_USAGE', `Unknown command: ${command}`);
  }

  const flags = parseFlags(rest, spec);

  switch (command) {
    case 'start':
      return {
        command,
        goal: getString(flags, 'goal'),
        actor: getString(flags, 'actor'),
        authToken: getString(flags, 'auth-token'),
        idempotencyKey: getString(flags, 'idempotency-key')
      };
    case 'status':
      return {
        command,
        runId: typeof flags.get('run-id') === 'string' ? (flags.get('run-id') as string) : undefined,
        actor: typeof flags.get('actor') === 'string' ? (flags.get('actor') as string) : undefined,
        authToken: typeof flags.get('auth-token') === 'string' ? (flags.get('auth-token') as string) : undefined
      };
    case 'pause':
      return {
        command,
        reason: getString(flags, 'reason'),
        actor: getString(flags, 'actor'),
        authToken: getString(flags, 'auth-token'),
        idempotencyKey: getString(flags, 'idempotency-key')
      };
    case 'resume':
      return {
        command,
        reason: getString(flags, 'reason'),
        actor: getString(flags, 'actor'),
        authToken: getString(flags, 'auth-token'),
        idempotencyKey: getString(flags, 'idempotency-key')
      };
    case 'reprioritize':
      return {
        command,
        taskId: getString(flags, 'task-id'),
        priority: getString(flags, 'priority') as 'P0' | 'P1' | 'P2' | 'P3',
        reason: getString(flags, 'reason'),
        actor: getString(flags, 'actor'),
        authToken: getString(flags, 'auth-token'),
        idempotencyKey: getString(flags, 'idempotency-key')
      };
    case 'message':
      return {
        command,
        to: getString(flags, 'to'),
        text: getString(flags, 'text'),
        taskId: typeof flags.get('task-id') === 'string' ? (flags.get('task-id') as string) : undefined,
        proofUri: typeof flags.get('proof-uri') === 'string' ? (flags.get('proof-uri') as string) : undefined,
        proofSha256: typeof flags.get('proof-sha256') === 'string' ? (flags.get('proof-sha256') as string) : undefined,
        completeTask: Boolean(flags.get('complete-task')),
        actor: getString(flags, 'actor'),
        authToken: getString(flags, 'auth-token'),
        idempotencyKey: getString(flags, 'idempotency-key')
      };
    case 'stop':
      return {
        command,
        reason: getString(flags, 'reason'),
        actor: getString(flags, 'actor'),
        authToken: getString(flags, 'auth-token'),
        idempotencyKey: getString(flags, 'idempotency-key')
      };
    default:
      throw new JuCliError('E_USAGE', `Unknown command: ${command}`);
  }
}
