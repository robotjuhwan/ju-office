import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../src/artifacts/hash.js';
import { validateProof } from '../../../src/artifacts/proof-validator.js';

const basePolicy = (artifactsDir: string) => ({
  artifactsDir,
  httpsAllowlist: ['example.com'],
  fetchTimeoutMs: 1_000,
  maxBytes: 20 * 1024 * 1024
});

describe('proof validator', () => {
  it('verifies matching file:// hash', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-proof-'));
    const artifactsDir = path.join(tmpDir, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
    const filePath = path.join(artifactsDir, 'proof.txt');
    const content = Buffer.from('proof-data');
    await fs.writeFile(filePath, content);

    const result = await validateProof(
      {
        uri: `file://${filePath}`,
        sha256: sha256Hex(content)
      },
      basePolicy(artifactsDir)
    );

    expect(result).toEqual({ status: 'verified', reasonCode: 'E_NONE' });
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects hash mismatch', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-proof-'));
    const artifactsDir = path.join(tmpDir, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
    const filePath = path.join(artifactsDir, 'proof.txt');
    await fs.writeFile(filePath, 'proof-data');

    const result = await validateProof(
      {
        uri: `file://${filePath}`,
        sha256: '0'.repeat(64)
      },
      basePolicy(artifactsDir)
    );

    expect(result.status).toBe('rejected');
    expect(result.reasonCode).toBe('E_HASH_MISMATCH');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects file:// paths outside artifacts directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-proof-'));
    const artifactsDir = path.join(tmpDir, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
    const outsidePath = path.join(tmpDir, 'outside.txt');
    const content = Buffer.from('outside-proof-data');
    await fs.writeFile(outsidePath, content);

    const result = await validateProof(
      {
        uri: `file://${outsidePath}`,
        sha256: sha256Hex(content)
      },
      basePolicy(artifactsDir)
    );

    expect(result.status).toBe('rejected');
    expect(result.reasonCode).toBe('E_FILE_OUTSIDE_ARTIFACTS');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects symlink file proofs even when symlink lives under artifacts/', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-proof-'));
    const artifactsDir = path.join(tmpDir, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
    const outsidePath = path.join(tmpDir, 'outside.txt');
    const outsideContent = Buffer.from('outside-via-symlink');
    await fs.writeFile(outsidePath, outsideContent);

    const symlinkPath = path.join(artifactsDir, 'symlink-proof.txt');
    try {
      await fs.symlink(outsidePath, symlinkPath);
    } catch {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    }

    const result = await validateProof(
      {
        uri: `file://${symlinkPath}`,
        sha256: sha256Hex(outsideContent)
      },
      basePolicy(artifactsDir)
    );

    expect(result.status).toBe('rejected');
    expect(result.reasonCode).toBe('E_FILE_OUTSIDE_ARTIFACTS');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects https:// hosts outside allowlist', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ju-proof-'));
    const result = await validateProof(
      {
        uri: 'https://not-allowed.example.com/proof.txt',
        sha256: 'a'.repeat(64)
      },
      basePolicy(path.join(tmpDir, 'artifacts'))
    );

    expect(result.status).toBe('rejected');
    expect(result.reasonCode).toBe('E_HOST_NOT_ALLOWED');
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
