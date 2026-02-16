import { describe, expect, it } from 'vitest';

import { parseCommand } from '../../../src/cli/parser.js';
import { JuCliError } from '../../../src/core/error-codes.js';

describe('cli parser', () => {
  it('parses start command', () => {
    const parsed = parseCommand([
      'start',
      '--goal',
      'Launch AI bookkeeping SaaS MVP',
      '--actor',
      'investor-1',
      '--auth-token',
      'token-investor-1',
      '--idempotency-key',
      'start-001'
    ]);

    expect(parsed.command).toBe('start');
    if (parsed.command === 'start') {
      expect(parsed.goal).toContain('AI bookkeeping');
    }
  });

  it('throws usage error on unknown flag', () => {
    expect(() => parseCommand(['status', '--unknown', 'x'])).toThrowError(JuCliError);
  });

  it('enforces complete-task required syntax at validation layer only', () => {
    const parsed = parseCommand([
      'message',
      '--to',
      'ceo',
      '--text',
      'ship it',
      '--complete-task',
      '--actor',
      'ceo-001',
      '--auth-token',
      'token-ceo-001',
      '--idempotency-key',
      'msg-1'
    ]);

    expect(parsed.command).toBe('message');
    if (parsed.command === 'message') {
      expect(parsed.completeTask).toBe(true);
    }
  });

  it('requires auth token on mutating commands', () => {
    expect(() =>
      parseCommand([
        'pause',
        '--reason',
        'Need more time',
        '--actor',
        'investor-1',
        '--idempotency-key',
        'pause-1'
      ])
    ).toThrowError(JuCliError);
  });
});
