import { describe, expect, it } from 'vitest';

import { parseCommand } from '../../../src/cli/parser.js';
import { JuCliError } from '../../../src/core/error-codes.js';

describe('cli parser', () => {
  it('parses init command', () => {
    const parsed = parseCommand(['init']);

    expect(parsed.command).toBe('init');
  });

  it('parses setup command', () => {
    const parsed = parseCommand(['setup']);

    expect(parsed.command).toBe('setup');
  });

  it('parses autopilot command with minimal flags', () => {
    const parsed = parseCommand([
      'autopilot',
      '--goal',
      'Build web snake game MVP with score and restart flow'
    ]);

    expect(parsed.command).toBe('autopilot');
    if (parsed.command === 'autopilot') {
      expect(parsed.goal).toContain('snake game');
      expect(parsed.actor).toBeUndefined();
      expect(parsed.authToken).toBeUndefined();
      expect(parsed.idempotencyKey).toBeUndefined();
      expect(parsed.delegate).toBeUndefined();
      expect(parsed.delegateTargetDir).toBeUndefined();
      expect(parsed.delegateModel).toBeUndefined();
    }
  });

  it('parses autopilot command with delegate flags', () => {
    const parsed = parseCommand([
      'autopilot',
      '--goal',
      'Build snake game',
      '--delegate',
      'codex',
      '--delegate-target-dir',
      './workspace',
      '--delegate-model',
      'gpt-5.3-codex',
      '--idempotency-key',
      'autopilot-001'
    ]);

    expect(parsed.command).toBe('autopilot');
    if (parsed.command === 'autopilot') {
      expect(parsed.delegate).toBe('codex');
      expect(parsed.delegateTargetDir).toBe('./workspace');
      expect(parsed.delegateModel).toBe('gpt-5.3-codex');
      expect(parsed.idempotencyKey).toBe('autopilot-001');
    }
  });

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

  it('parses qa command', () => {
    const parsed = parseCommand([
      'qa',
      '--result',
      'pass',
      '--summary',
      'QA cycle passed with all tests green',
      '--actor',
      'investor-1',
      '--auth-token',
      'token-investor-1',
      '--idempotency-key',
      'qa-001'
    ]);

    expect(parsed.command).toBe('qa');
    if (parsed.command === 'qa') {
      expect(parsed.result).toBe('pass');
      expect(parsed.summary).toContain('all tests green');
    }
  });

  it('parses review command', () => {
    const parsed = parseCommand([
      'review',
      '--reviewer',
      'security',
      '--decision',
      'approve',
      '--summary',
      'Security review approved with no blockers',
      '--actor',
      'investor-1',
      '--auth-token',
      'token-investor-1',
      '--idempotency-key',
      'review-001'
    ]);

    expect(parsed.command).toBe('review');
    if (parsed.command === 'review') {
      expect(parsed.reviewer).toBe('security');
      expect(parsed.decision).toBe('approve');
    }
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
