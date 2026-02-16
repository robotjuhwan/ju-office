import { readdir } from 'node:fs/promises';

import { exists, readJsonFile, writeJsonAtomic } from '../utils/fs.js';
import type { ArtifactProof } from '../types/proof.js';
import type { AppPaths } from './paths.js';
import { proofFile, proofsDir } from './paths.js';

export async function writeProof(paths: AppPaths, runId: string, proof: ArtifactProof): Promise<void> {
  await writeJsonAtomic(proofFile(paths, runId, proof.proofId), proof);
}

export async function readProof(paths: AppPaths, runId: string, proofId: string): Promise<ArtifactProof | null> {
  const filePath = proofFile(paths, runId, proofId);
  if (!(await exists(filePath))) {
    return null;
  }
  return readJsonFile<ArtifactProof>(filePath);
}

export async function listProofs(paths: AppPaths, runId: string): Promise<ArtifactProof[]> {
  const directory = proofsDir(paths, runId);
  if (!(await exists(directory))) {
    return [];
  }

  const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const proofs: ArtifactProof[] = [];

  for (const fileName of files) {
    const proof = await readJsonFile<ArtifactProof>(`${directory}/${fileName}`);
    proofs.push(proof);
  }

  return proofs;
}
