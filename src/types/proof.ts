import type { z } from 'zod';

import type { artifactProofSchema, proofReasonCodeSchema, proofVerificationSchema } from '../contracts/proof.contract.js';

export type ProofReasonCode = z.infer<typeof proofReasonCodeSchema>;
export type ProofVerification = z.infer<typeof proofVerificationSchema>;
export type ArtifactProof = z.infer<typeof artifactProofSchema>;
