import { readJsonFileOrDefault, writeJsonAtomic } from '../utils/fs.js';
import type { AppPaths } from './paths.js';

export type RateLimitMap = Record<string, Record<string, string[]>>;

export async function readRateLimitMap(paths: AppPaths): Promise<RateLimitMap> {
  return readJsonFileOrDefault<RateLimitMap>(paths.rateLimitFile, {});
}

export async function writeRateLimitMap(paths: AppPaths, state: RateLimitMap): Promise<void> {
  await writeJsonAtomic(paths.rateLimitFile, state);
}
