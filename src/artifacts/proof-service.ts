import { artifactProofSchema } from '../contracts/proof.contract.js';
import type { ArtifactProof } from '../types/proof.js';
import { createProofId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import type { AppPaths } from '../store/paths.js';
import { listProofs, writeProof } from '../store/proof-store.js';
import { validateProof, type ProofValidationPolicy } from './proof-validator.js';

export interface CreateProofInput {
  runId: string;
  taskId: string;
  uri: string;
  sha256: string;
}

export async function createAndVerifyProof(
  paths: AppPaths,
  input: CreateProofInput,
  policy: ProofValidationPolicy
): Promise<ArtifactProof> {
  const existingProofs = await listProofs(paths, input.runId);
  const proofId = createProofId(existingProofs.length);
  const now = nowIso();

  const validation = await validateProof({ uri: input.uri, sha256: input.sha256 }, policy);

  const proof: ArtifactProof = {
    proofId,
    taskId: input.taskId,
    uri: input.uri,
    sha256: input.sha256,
    verification: {
      status: validation.status,
      reasonCode: validation.reasonCode,
      verifiedAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  artifactProofSchema.parse(proof);
  await writeProof(paths, input.runId, proof);

  return proof;
}
