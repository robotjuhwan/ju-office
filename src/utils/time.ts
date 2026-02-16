export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function toRunTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

export function minutesAgo(minutes: number, from = new Date()): Date {
  return new Date(from.getTime() - minutes * 60_000);
}

export function isWithinRollingWindow(iso: string, now: Date, windowMs: number): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return false;
  }
  return now.getTime() - ts <= windowMs;
}
