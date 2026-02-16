import type { RateLimitMap } from '../store/rate-limit-store.js';
import { readRateLimitMap, writeRateLimitMap } from '../store/rate-limit-store.js';
import type { AppPaths } from '../store/paths.js';
import { JuCliError } from './error-codes.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

function toStorageError(error: unknown): JuCliError {
  const reason =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? ((error as { code: string }).code as string)
      : 'UNKNOWN';

  return new JuCliError('E_STORAGE_IO', 'Rate-limit state could not be read or written', { reason });
}

export async function checkAndConsumeRateLimit(
  paths: AppPaths,
  actor: string,
  command: string,
  limitPerHour: number,
  now = new Date()
): Promise<void> {
  let state: RateLimitMap;
  try {
    state = await readRateLimitMap(paths);
  } catch (error) {
    throw toStorageError(error);
  }

  const actorState = state[actor] ?? {};
  const commandEvents = actorState[command] ?? [];

  const nowMs = now.getTime();
  const windowStart = nowMs - ONE_HOUR_MS;
  const filtered = commandEvents.filter((iso) => {
    const ts = Date.parse(iso);
    return !Number.isNaN(ts) && ts >= windowStart;
  });

  if (filtered.length >= limitPerHour) {
    throw new JuCliError('E_RATE_LIMIT_EXCEEDED', 'Mutating command rate limit exceeded', { actor, command });
  }

  filtered.push(now.toISOString());
  actorState[command] = filtered;
  state[actor] = actorState;

  try {
    await writeRateLimitMap(paths, state as RateLimitMap);
  } catch (error) {
    throw toStorageError(error);
  }
}
