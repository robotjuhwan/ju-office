import { z } from 'zod';

export const proofIdPattern = /^PRF-[0-9]{3,}$/;
export const sha256Pattern = /^[a-f0-9]{64}$/;

export const proofReasonCodeSchema = z.enum([
  'E_NONE',
  'E_HASH_MISMATCH',
  'E_FILE_NOT_FOUND',
  'E_FILE_TOO_LARGE',
  'E_FILE_OUTSIDE_ARTIFACTS',
  'E_HTTP_STATUS',
  'E_HTTP_TOO_LARGE',
  'E_HOST_NOT_ALLOWED',
  'E_HTTP_TIMEOUT',
  'E_HTTP_REDIRECT',
  'E_INVALID_URI',
  'E_NETWORK_ERROR'
]);

export const proofVerificationSchema = z
  .object({
    status: z.enum(['pending', 'verified', 'rejected']),
    reasonCode: proofReasonCodeSchema,
    verifiedAt: z.string().datetime()
  })
  .superRefine((verification, ctx) => {
    if (verification.status === 'verified' && verification.reasonCode !== 'E_NONE') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Verified proof must use E_NONE reason code' });
    }
    if (verification.status === 'rejected' && verification.reasonCode === 'E_NONE') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rejected proof must include failure reason code' });
    }
  });

export const artifactProofSchema = z.object({
  proofId: z.string().regex(proofIdPattern),
  taskId: z.string(),
  uri: z.string().refine((value) => value.startsWith('file://') || value.startsWith('https://'), {
    message: 'Proof URI must use file:// or https://'
  }),
  sha256: z.string().regex(sha256Pattern),
  verification: proofVerificationSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
