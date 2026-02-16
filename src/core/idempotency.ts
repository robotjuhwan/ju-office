import { sha256Hex } from '../artifacts/hash.js';
import { canonicalJson } from '../utils/json.js';
import type { AppPaths } from '../store/paths.js';
import { readIdempotencyMap, type IdempotencyMap, writeIdempotencyMap } from '../store/idempotency-store.js';
import { JuCliError } from './error-codes.js';

export function buildPayloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}

export async function ensureIdempotency(
  paths: AppPaths,
  runId: string,
  key: string,
  payload: unknown
): Promise<{ replay: boolean; storedResponse?: unknown; map: IdempotencyMap; payloadHash: string }> {
  const map = await readIdempotencyMap(paths, runId);
  const payloadHash = buildPayloadHash(payload);
  const existing = map[key];

  if (!existing) {
    return { replay: false, map, payloadHash };
  }

  if (existing.payloadHash !== payloadHash) {
    throw new JuCliError('E_IDEMPOTENCY_CONFLICT', 'Idempotency key is already bound to a different payload', {
      runId,
      idempotencyKey: key
    });
  }

  return {
    replay: true,
    storedResponse: existing.response,
    map,
    payloadHash
  };
}

export async function commitIdempotency(
  paths: AppPaths,
  runId: string,
  key: string,
  payloadHash: string,
  response: unknown,
  existingMap: IdempotencyMap
): Promise<void> {
  const map = {
    ...existingMap,
    [key]: {
      payloadHash,
      response
    }
  };

  await writeIdempotencyMap(paths, runId, map);
}
