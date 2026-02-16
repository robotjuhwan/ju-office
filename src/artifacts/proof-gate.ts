import type { ArtifactProof } from '../types/proof.js';
import type { Task } from '../types/task.js';

export function canMarkTaskDone(task: Task, proofs: ArtifactProof[]): boolean {
  const proofSet = new Set(task.proofIds);
  return proofs.some(
    (proof) => proofSet.has(proof.proofId) && proof.taskId === task.taskId && proof.verification.status === 'verified'
  );
}

export function canCompleteRun(tasksDone: number, proofsVerified: number): boolean {
  return tasksDone >= 1 && proofsVerified >= 1;
}
