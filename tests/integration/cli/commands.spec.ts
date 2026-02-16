import { promises as fs } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../src/artifacts/hash.js';
import { resolvePaths } from '../../../src/store/paths.js';
import { readRun } from '../../../src/store/run-store.js';
import { readTasks } from '../../../src/store/task-store.js';
import { runCliCommand, createTestWorkspace } from '../../helpers/test-env.js';

async function completeAllTasksWithProofs(rootDir: string, runId: string): Promise<void> {
  const paths = resolvePaths(rootDir);
  const tasks = await readTasks(paths, runId);
  const artifactDir = path.join(rootDir, 'artifacts', 'autopilot-gate');
  await fs.mkdir(artifactDir, { recursive: true });

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    if (!task) {
      continue;
    }

    const artifactPath = path.join(artifactDir, `${task.taskId}.txt`);
    const content = Buffer.from(`proof:${task.taskId}`);
    await fs.writeFile(artifactPath, content);

    const complete = await runCliCommand(rootDir, [
      'message',
      '--to',
      'ceo',
      '--text',
      `Proof recorded for ${task.taskId}`,
      '--task-id',
      task.taskId,
      '--proof-uri',
      `file://${artifactPath}`,
      '--proof-sha256',
      sha256Hex(content),
      '--complete-task',
      '--actor',
      'ceo-001',
      '--auth-token',
      'token-ceo-001',
      '--idempotency-key',
      `autopilot-proof-${i + 1}`
    ]);

    expect(complete.exitCode).toBe(0);
  }
}

describe('cli commands integration', () => {
  it('supports full command set with deterministic payloads', async () => {
    const ws = await createTestWorkspace();
    try {
      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch AI bookkeeping SaaS MVP with investor visibility',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'start-001'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;

      const status = await runCliCommand(ws.rootDir, [
        'status',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1'
      ]);
      expect(status.exitCode).toBe(0);
      expect((status.stdout as any).data.run.runId).toBe(runId);

      const pause = await runCliCommand(ws.rootDir, [
        'pause',
        '--reason',
        'Need investor approval on pricing',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'pause-001'
      ]);
      expect(pause.exitCode).toBe(0);
      expect((pause.stdout as any).data.status).toBe('paused');

      const resume = await runCliCommand(ws.rootDir, [
        'resume',
        '--reason',
        'Approval received and execution can continue',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'resume-001'
      ]);
      expect(resume.exitCode).toBe(0);
      expect((resume.stdout as any).data.status).toBe('executing');

      const reprio = await runCliCommand(ws.rootDir, [
        'reprioritize',
        '--task-id',
        'TASK-001',
        '--priority',
        'P0',
        '--reason',
        'Revenue risk is highest priority',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'reprio-001'
      ]);
      expect(reprio.exitCode).toBe(0);
      expect((reprio.stdout as any).data).toEqual({ taskId: 'TASK-001', priority: 'P0' });

      const message = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Ship demo today',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'msg-001'
      ]);
      expect(message.exitCode).toBe(0);
      expect((message.stdout as any).data.eventId).toBeTypeOf('string');

      const artifactDir = path.join(ws.rootDir, 'artifacts', 'integration-cli');
      await fs.mkdir(artifactDir, { recursive: true });
      const artifactPath = path.join(artifactDir, 'demo.txt');
      const content = Buffer.from('demo output');
      await fs.writeFile(artifactPath, content);
      const hash = sha256Hex(content);

      const complete = await runCliCommand(ws.rootDir, [
        'message',
        '--to',
        'ceo',
        '--text',
        'Demo uploaded',
        '--task-id',
        'TASK-001',
        '--proof-uri',
        `file://${artifactPath}`,
        '--proof-sha256',
        hash,
        '--complete-task',
        '--actor',
        'ceo-001',
        '--auth-token',
        'token-ceo-001',
        '--idempotency-key',
        'proof-001'
      ]);
      expect(complete.exitCode).toBe(0);
      expect((complete.stdout as any).data.taskUpdate.status).toBe('done');

      const stop = await runCliCommand(ws.rootDir, [
        'stop',
        '--reason',
        'End of MVP run window',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'stop-001'
      ]);
      expect(stop.exitCode).toBe(0);
      expect((stop.stdout as any).data.status).toBe('stopped');

      await fs.rm(artifactDir, { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('requires QA pass and three approvals before autopilot run completion', async () => {
    const ws = await createTestWorkspace();
    try {
      const authPath = path.join(ws.rootDir, 'config', 'auth.json');
      const auth = JSON.parse(await fs.readFile(authPath, 'utf8')) as any;
      auth.rateLimitsPerHour.defaultMutating = 100;
      await fs.writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8');

      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch autopilot QA and validation lifecycle coverage for Ju Office MVP',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-start-001'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;
      const paths = resolvePaths(ws.rootDir);
      await completeAllTasksWithProofs(ws.rootDir, runId);

      const runAfterProofs = await readRun(paths, runId);
      expect(runAfterProofs?.status).toBe('verifying');
      expect(runAfterProofs?.autopilot?.phase).toBe('qa');
      expect(runAfterProofs?.autopilot?.state).toBe('awaiting_qa');

      const reviewBeforeQa = await runCliCommand(ws.rootDir, [
        'review',
        '--reviewer',
        'architect',
        '--decision',
        'approve',
        '--summary',
        'Attempt review before QA should fail',
        '--actor',
        'architect-001',
        '--auth-token',
        'token-architect-001',
        '--idempotency-key',
        'autopilot-review-before-qa'
      ]);
      expect(reviewBeforeQa.exitCode).toBe(7);

      const qaPass = await runCliCommand(ws.rootDir, [
        'qa',
        '--result',
        'pass',
        '--summary',
        'QA passed with deterministic checks',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-qa-pass-1'
      ]);
      expect(qaPass.exitCode).toBe(0);

      const unauthorizedReview = await runCliCommand(ws.rootDir, [
        'review',
        '--reviewer',
        'security',
        '--decision',
        'approve',
        '--summary',
        'Architect actor cannot sign security gate',
        '--actor',
        'architect-001',
        '--auth-token',
        'token-architect-001',
        '--idempotency-key',
        'autopilot-review-security-unauthorized-1'
      ]);
      expect(unauthorizedReview.exitCode).toBe(4);

      const architectReview = await runCliCommand(ws.rootDir, [
        'review',
        '--reviewer',
        'architect',
        '--decision',
        'approve',
        '--summary',
        'Architecture validated',
        '--actor',
        'architect-001',
        '--auth-token',
        'token-architect-001',
        '--idempotency-key',
        'autopilot-review-architect-1'
      ]);
      expect(architectReview.exitCode).toBe(0);
      expect((architectReview.stdout as any).data.status).toBe('verifying');

      const securityReview = await runCliCommand(ws.rootDir, [
        'review',
        '--reviewer',
        'security',
        '--decision',
        'approve',
        '--summary',
        'Security review approved',
        '--actor',
        'security-001',
        '--auth-token',
        'token-security-001',
        '--idempotency-key',
        'autopilot-review-security-1'
      ]);
      expect(securityReview.exitCode).toBe(0);
      expect((securityReview.stdout as any).data.status).toBe('verifying');

      const codeReview = await runCliCommand(ws.rootDir, [
        'review',
        '--reviewer',
        'code',
        '--decision',
        'approve',
        '--summary',
        'Code quality review approved',
        '--actor',
        'code-001',
        '--auth-token',
        'token-code-001',
        '--idempotency-key',
        'autopilot-review-code-1'
      ]);
      expect(codeReview.exitCode).toBe(0);
      expect((codeReview.stdout as any).data.status).toBe('completed');

      const finalRun = await readRun(paths, runId);
      expect(finalRun?.status).toBe('completed');
      expect(finalRun?.autopilot?.phase).toBe('complete');
      expect(finalRun?.autopilot?.state).toBe('complete');

      await fs.access(path.join(ws.rootDir, '.omx', 'state', 'autopilot-state.json')).then(
        () => {
          throw new Error('autopilot-state.json should be removed after terminal completion');
        },
        () => undefined
      );

      await fs.rm(path.join(ws.rootDir, 'artifacts', 'autopilot-gate'), { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('fails autopilot run when same QA failure repeats three times', async () => {
    const ws = await createTestWorkspace();
    try {
      const authPath = path.join(ws.rootDir, 'config', 'auth.json');
      const auth = JSON.parse(await fs.readFile(authPath, 'utf8')) as any;
      auth.rateLimitsPerHour.defaultMutating = 100;
      await fs.writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8');

      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch autopilot QA repeat-failure escalation validation for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-qa-fail-start-1'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;
      const paths = resolvePaths(ws.rootDir);

      await completeAllTasksWithProofs(ws.rootDir, runId);

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const qaFail = await runCliCommand(ws.rootDir, [
          'qa',
          '--result',
          'fail',
          '--summary',
          'Typecheck failed in deterministic test',
          '--failure-signature',
          'TSC-ERROR-001',
          '--actor',
          'investor-1',
          '--auth-token',
          'token-investor-1',
          '--idempotency-key',
          `autopilot-qa-fail-${attempt}`
        ]);
        expect(qaFail.exitCode).toBe(0);
      }

      const finalRun = await readRun(paths, runId);
      expect(finalRun?.status).toBe('failed');
      expect(finalRun?.autopilot?.qa.repeatedFailureCount).toBe(3);

      await fs.access(path.join(ws.rootDir, '.omx', 'state', 'autopilot-state.json')).then(
        () => {
          throw new Error('autopilot-state.json should be removed after terminal failure');
        },
        () => undefined
      );

      await fs.rm(path.join(ws.rootDir, 'artifacts', 'autopilot-gate'), { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('fails autopilot run when QA cycles exceed max budget even with pass results', async () => {
    const ws = await createTestWorkspace();
    try {
      const authPath = path.join(ws.rootDir, 'config', 'auth.json');
      const auth = JSON.parse(await fs.readFile(authPath, 'utf8')) as any;
      auth.rateLimitsPerHour.defaultMutating = 100;
      await fs.writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8');

      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch autopilot QA cycle budget escalation validation for Ju Office',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-qa-budget-start-1'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;
      const paths = resolvePaths(ws.rootDir);

      await completeAllTasksWithProofs(ws.rootDir, runId);

      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const qaPass = await runCliCommand(ws.rootDir, [
          'qa',
          '--result',
          'pass',
          '--summary',
          `QA pass attempt ${attempt}`,
          '--actor',
          'investor-1',
          '--auth-token',
          'token-investor-1',
          '--idempotency-key',
          `autopilot-qa-budget-pass-${attempt}`
        ]);
        expect(qaPass.exitCode).toBe(0);
      }

      const finalRun = await readRun(paths, runId);
      expect(finalRun?.status).toBe('failed');
      expect(finalRun?.autopilot?.qa.cyclesCompleted).toBe(6);

      await fs.rm(path.join(ws.rootDir, 'artifacts', 'autopilot-gate'), { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('keeps verifying status after pause/resume during QA phase', async () => {
    const ws = await createTestWorkspace();
    try {
      const authPath = path.join(ws.rootDir, 'config', 'auth.json');
      const auth = JSON.parse(await fs.readFile(authPath, 'utf8')) as any;
      auth.rateLimitsPerHour.defaultMutating = 100;
      await fs.writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8');

      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch pause resume verification flow while awaiting QA',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-pause-resume-start-1'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;
      const paths = resolvePaths(ws.rootDir);

      await completeAllTasksWithProofs(ws.rootDir, runId);

      const pause = await runCliCommand(ws.rootDir, [
        'pause',
        '--reason',
        'Pause while QA runbook is reviewed',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-pause-resume-pause-1'
      ]);
      expect(pause.exitCode).toBe(0);

      const resume = await runCliCommand(ws.rootDir, [
        'resume',
        '--reason',
        'Resume QA gate processing',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-pause-resume-resume-1'
      ]);
      expect(resume.exitCode).toBe(0);
      expect((resume.stdout as any).data.status).toBe('verifying');

      const runAfterResume = await readRun(paths, runId);
      expect(runAfterResume?.status).toBe('verifying');
      expect(runAfterResume?.autopilot?.phase).toBe('qa');

      const qaPass = await runCliCommand(ws.rootDir, [
        'qa',
        '--result',
        'pass',
        '--summary',
        'QA completed after resume',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-pause-resume-qa-1'
      ]);
      expect(qaPass.exitCode).toBe(0);

      await fs.rm(path.join(ws.rootDir, 'artifacts', 'autopilot-gate'), { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });

  it('replays idempotent reject review without failing QA-precondition checks', async () => {
    const ws = await createTestWorkspace();
    try {
      const authPath = path.join(ws.rootDir, 'config', 'auth.json');
      const auth = JSON.parse(await fs.readFile(authPath, 'utf8')) as any;
      auth.rateLimitsPerHour.defaultMutating = 100;
      await fs.writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8');

      const start = await runCliCommand(ws.rootDir, [
        'start',
        '--goal',
        'Launch idempotent reject review replay validation',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-reject-idem-start-1'
      ]);
      expect(start.exitCode).toBe(0);
      const runId = (start.stdout as any).data.runId as string;

      await completeAllTasksWithProofs(ws.rootDir, runId);

      const qaPass = await runCliCommand(ws.rootDir, [
        'qa',
        '--result',
        'pass',
        '--summary',
        'QA pass before reject test',
        '--actor',
        'investor-1',
        '--auth-token',
        'token-investor-1',
        '--idempotency-key',
        'autopilot-reject-idem-qa-pass-1'
      ]);
      expect(qaPass.exitCode).toBe(0);

      const rejectCommand = [
        'review',
        '--reviewer',
        'architect',
        '--decision',
        'reject',
        '--summary',
        'Architecture requires one more correction pass',
        '--actor',
        'architect-001',
        '--auth-token',
        'token-architect-001',
        '--idempotency-key',
        'autopilot-reject-idem-review-1'
      ];

      const firstReject = await runCliCommand(ws.rootDir, rejectCommand);
      expect(firstReject.exitCode).toBe(0);

      const replayReject = await runCliCommand(ws.rootDir, rejectCommand);
      expect(replayReject.exitCode).toBe(0);

      await fs.rm(path.join(ws.rootDir, 'artifacts', 'autopilot-gate'), { recursive: true, force: true });
    } finally {
      await ws.cleanup();
    }
  });
});
