import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function readJsonFileOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  if (!(await exists(filePath))) {
    return fallback;
  }
  return readJsonFile<T>(filePath);
}

export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } finally {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // no-op: temp file may already be moved or removed
    }
  }
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function appendNdjson(filePath: string, event: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readNdjson<T>(filePath: string): Promise<T[]> {
  if (!(await exists(filePath))) {
    return [];
  }
  const raw = await fs.readFile(filePath, 'utf8');
  if (!raw.trim()) {
    return [];
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}
