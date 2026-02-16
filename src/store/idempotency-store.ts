import { readJsonFileOrDefault, writeJsonAtomic } from '../utils/fs.js';
import type { AppPaths } from './paths.js';
import { idempotencyFile } from './paths.js';

export interface IdempotencyRecord {
  payloadHash: string;
  response: unknown;
}

export type IdempotencyMap = Record<string, IdempotencyRecord>;

export async function readIdempotencyMap(paths: AppPaths, runId: string): Promise<IdempotencyMap> {
  return readJsonFileOrDefault<IdempotencyMap>(idempotencyFile(paths, runId), {});
}

export async function writeIdempotencyMap(paths: AppPaths, runId: string, map: IdempotencyMap): Promise<void> {
  await writeJsonAtomic(idempotencyFile(paths, runId), map);
}
