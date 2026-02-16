import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { sha256Pattern } from '../contracts/proof.contract.js';
import { sha256Hex } from './hash.js';

export interface ProofValidationInput {
  uri: string;
  sha256: string;
}

export interface ProofValidationPolicy {
  artifactsDir: string;
  httpsAllowlist: string[];
  fetchTimeoutMs: number;
  maxBytes: number;
}

export interface ProofValidationResult {
  status: 'verified' | 'rejected';
  reasonCode:
    | 'E_NONE'
    | 'E_HASH_MISMATCH'
    | 'E_FILE_NOT_FOUND'
    | 'E_FILE_TOO_LARGE'
    | 'E_FILE_OUTSIDE_ARTIFACTS'
    | 'E_HTTP_STATUS'
    | 'E_HTTP_TOO_LARGE'
    | 'E_HOST_NOT_ALLOWED'
    | 'E_HTTP_TIMEOUT'
    | 'E_HTTP_REDIRECT'
    | 'E_INVALID_URI'
    | 'E_NETWORK_ERROR';
}

function isFileUri(uri: string): boolean {
  return uri.startsWith('file://');
}

function isHttpsUri(uri: string): boolean {
  return uri.startsWith('https://');
}

function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(directory, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  if ('cause' in error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && 'code' in cause && typeof (cause as { code?: unknown }).code === 'string') {
      return (cause as { code: string }).code;
    }
  }

  return undefined;
}

export async function validateProof(
  input: ProofValidationInput,
  policy: ProofValidationPolicy
): Promise<ProofValidationResult> {
  if (!isFileUri(input.uri) && !isHttpsUri(input.uri)) {
    return { status: 'rejected', reasonCode: 'E_INVALID_URI' };
  }

  if (!sha256Pattern.test(input.sha256)) {
    return { status: 'rejected', reasonCode: 'E_HASH_MISMATCH' };
  }

  if (isFileUri(input.uri)) {
    return validateFileProof(input.uri, input.sha256, policy);
  }

  return validateHttpsProof(input.uri, input.sha256, policy);
}

async function validateFileProof(
  uri: string,
  expectedHash: string,
  policy: ProofValidationPolicy
): Promise<ProofValidationResult> {
  let filePath: string;
  try {
    const fileUrl = new URL(uri);
    filePath = path.resolve(fileURLToPath(fileUrl));
  } catch {
    return { status: 'rejected', reasonCode: 'E_INVALID_URI' };
  }

  const artifactsDir = path.resolve(policy.artifactsDir);
  let artifactsRealPath: string;
  try {
    const artifactsStat = await fs.lstat(artifactsDir);
    if (artifactsStat.isSymbolicLink()) {
      return { status: 'rejected', reasonCode: 'E_FILE_OUTSIDE_ARTIFACTS' };
    }
    artifactsRealPath = await fs.realpath(artifactsDir);
  } catch {
    return { status: 'rejected', reasonCode: 'E_FILE_OUTSIDE_ARTIFACTS' };
  }

  try {
    const fileLStat = await fs.lstat(filePath);
    if (fileLStat.isSymbolicLink()) {
      return { status: 'rejected', reasonCode: 'E_FILE_OUTSIDE_ARTIFACTS' };
    }

    const resolvedPath = await fs.realpath(filePath);
    if (!isPathWithinDirectory(resolvedPath, artifactsRealPath)) {
      return { status: 'rejected', reasonCode: 'E_FILE_OUTSIDE_ARTIFACTS' };
    }

    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return { status: 'rejected', reasonCode: 'E_FILE_NOT_FOUND' };
    }
    if (stats.size > policy.maxBytes) {
      return { status: 'rejected', reasonCode: 'E_FILE_TOO_LARGE' };
    }

    const fileData = await fs.readFile(resolvedPath);
    const computedHash = sha256Hex(fileData);
    if (computedHash !== expectedHash) {
      return { status: 'rejected', reasonCode: 'E_HASH_MISMATCH' };
    }
    return { status: 'verified', reasonCode: 'E_NONE' };
  } catch {
    return { status: 'rejected', reasonCode: 'E_FILE_NOT_FOUND' };
  }
}

async function validateHttpsProof(
  uri: string,
  expectedHash: string,
  policy: ProofValidationPolicy
): Promise<ProofValidationResult> {
  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    return { status: 'rejected', reasonCode: 'E_INVALID_URI' };
  }

  const hostname = parsedUri.hostname.toLowerCase();
  if (!policy.httpsAllowlist.map((host) => host.toLowerCase()).includes(hostname)) {
    return { status: 'rejected', reasonCode: 'E_HOST_NOT_ALLOWED' };
  }

  const timeoutSignal = AbortSignal.timeout(policy.fetchTimeoutMs);

  try {
    const response = await fetch(uri, { signal: timeoutSignal, redirect: 'error' });
    if (response.status !== 200) {
      return { status: 'rejected', reasonCode: 'E_HTTP_STATUS' };
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isNaN(contentLength) && contentLength > policy.maxBytes) {
        return { status: 'rejected', reasonCode: 'E_HTTP_TOO_LARGE' };
      }
    }

    const body = response.body;
    if (!body) {
      return { status: 'rejected', reasonCode: 'E_NETWORK_ERROR' };
    }

    const reader = body.getReader();
    const hasher = createHash('sha256');
    let bytesRead = 0;

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      bytesRead += chunk.value.byteLength;
      if (bytesRead > policy.maxBytes) {
        await reader.cancel('proof payload too large');
        return { status: 'rejected', reasonCode: 'E_HTTP_TOO_LARGE' };
      }

      hasher.update(chunk.value);
    }

    const computedHash = hasher.digest('hex');
    if (computedHash !== expectedHash) {
      return { status: 'rejected', reasonCode: 'E_HASH_MISMATCH' };
    }

    return { status: 'verified', reasonCode: 'E_NONE' };
  } catch (error) {
    const code = extractErrorCode(error);
    if (code === 'ABORT_ERR') {
      return { status: 'rejected', reasonCode: 'E_HTTP_TIMEOUT' };
    }
    if (code === 'ERR_FR_REDIRECT') {
      return { status: 'rejected', reasonCode: 'E_HTTP_REDIRECT' };
    }
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      return { status: 'rejected', reasonCode: 'E_HTTP_TIMEOUT' };
    }
    if (error instanceof Error && /redirect/i.test(error.message)) {
      return { status: 'rejected', reasonCode: 'E_HTTP_REDIRECT' };
    }
    return { status: 'rejected', reasonCode: 'E_NETWORK_ERROR' };
  }
}
