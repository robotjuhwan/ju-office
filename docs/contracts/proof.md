# ArtifactProof Contract

Proofs are persisted under `data/runs/<runId>/proofs/<proofId>.json`.

- `proofId`: `^PRF-[0-9]{3,}$`
- `uri`: `file://` or `https://`
- `sha256`: lowercase 64-hex
- `verification.status`: `pending|verified|rejected`
- `verification.reasonCode`: one of `E_NONE`, `E_HASH_MISMATCH`, `E_FILE_NOT_FOUND`, `E_FILE_TOO_LARGE`, `E_FILE_OUTSIDE_ARTIFACTS`, `E_HTTP_STATUS`, `E_HTTP_TOO_LARGE`, `E_HOST_NOT_ALLOWED`, `E_HTTP_TIMEOUT`, `E_HTTP_REDIRECT`, `E_INVALID_URI`, `E_NETWORK_ERROR`

Validation policy:
- `file://` proofs are restricted to `<repo>/artifacts/**` and max `20MB`
- `https://` proofs must match config allowlist (`config/auth.json > proofPolicy.httpsAllowlist`)
- remote fetch enforces timeout and rejects redirects
