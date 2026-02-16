import { readJsonFileOrDefault, writeJsonAtomic } from '../utils/fs.js';
import type { Task } from '../types/task.js';
import type { AppPaths } from './paths.js';
import { tasksFile } from './paths.js';

export async function readTasks(paths: AppPaths, runId: string): Promise<Task[]> {
  return readJsonFileOrDefault<Task[]>(tasksFile(paths, runId), []);
}

export async function writeTasks(paths: AppPaths, runId: string, tasks: Task[]): Promise<void> {
  await writeJsonAtomic(tasksFile(paths, runId), tasks);
}
