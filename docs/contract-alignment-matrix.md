# Contract Alignment Review Matrix

Evidence-backed implementation-vs-contract comparison for runtime, CLI, auth, locks, snapshots, and docs artifacts.

- Domain: command parsing and dispatch
  - Contract expectation: CLI commands parse strictly by command-specific flag schema; unknown/invalid flags/values rejected with usage errors; required flags enforced; unsupported commands rejected.
  - Observed implementation: parser maintains per-command specs, rejects unknown flags and missing values/required flags with `E_USAGE`, and maps every supported command through `processParsedCommand` from switch dispatch.
  - Status: **Aligned (pass)**
  - Mismatch tag: **must-have (pass)**
  - Severity / confidence: **Low / High**
  - Evidence: `src/cli/parser.ts:10-243`, `src/core/command-processor.ts:1633-1634`, `src/cli/index.ts:2-15`, `tests/unit/cli/parser.spec.ts:81-90`

- Domain: error envelope and exit-code mapping
  - Contract expectation: all CLI errors emit `ok=false` JSON on stderr plus mapped exit codes (`E_USAGE`→2, `E_CONTRACT_VALIDATION`→3, `E_UNAUTHORIZED_ACTOR`→4, `E_RATE_LIMIT_EXCEEDED`→5, `E_IDEMPOTENCY_CONFLICT`→6, `E_INVALID_TRANSITION`→7, `E_ACTIVE_RUN_LOCK`→8, `E_STORAGE_IO`→9, `E_ARTIFACT_VERIFICATION_FAILED`→10, `E_INTERNAL`→11); internal errors must be sanitized.
  - Observed implementation: `exitCodeByError` enumerates all mapping values exactly; `cli/index.ts` converts normalized errors via `toErrorPayload` and writes JSON to stderr; `toErrorPayload` strips details for `E_INTERNAL`.
  - Status: **Aligned (pass)**
  - Mismatch tag: **must-have (pass)**
  - Severity / confidence: **Low / High**
  - Evidence: `src/core/error-codes.ts:13-24`, `src/core/error-codes.ts:50-67`, `src/core/error-codes.ts:70-97`, `src/core/error-codes.ts:58-59`, `src/cli/index.ts:10-15`, `src/contracts/cli-error.contract.ts:3-23`, `docs/contracts/cli-error.md:19-34`, `tests/unit/cli/error-codes.spec.ts:6-17,38-49`

- Domain: auth + status visibility policy
  - Contract expectation: startup mutation requires actor+token authorization; status visibility is either open or actor-restricted (`readOnlyOpen`) and uses local setup defaults when present.
  - Observed implementation: mutating commands call `authorizeMutatingActor`, then validate actor command allowance and token through timing-safe compare. `processStatus` loads `.ju-office.env` fallback state, resolves default actor/token only when appropriate, and enforces `readOnlyOpen` constraints.
  - Status: **Aligned (pass, with contextual caveat)**
  - Mismatch tag: **must-have (conditional caveat)**
  - Severity / confidence: **Medium / High**
  - Evidence: `src/core/auth.ts:126-140,146-163`, `src/core/auth.ts:74-94`, `src/core/command-processor.ts:599-621,623-646`, `src/core/command-processor.ts:1630-1638`, `src/core/command-processor.ts:132-139`, `src/core/local-env.ts:47-70`, `src/core/command-processor.ts:269-275`, `tests/integration/cli/security-and-error-mapping.spec.ts:266-289`, `docs/mvp-scope.md:21-29`
  - Notes:
    - When `readOnlyOpen=false`, local `.ju-office.env` can implicitly satisfy status auth (status request without flags).
    - If `.ju-office.env` is absent or unresolved for default actor, status requires explicit `--actor/--auth-token` and returns `E_UNAUTHORIZED_ACTOR`.

- Domain: idempotency contract
  - Contract expectation: deterministic payload hashing and key replay with conflict detection; successful replay should return stored response.
  - Observed implementation: payload hash is canonical JSON SHA-256, stored under idempotency map by key; same key+payload returns replay response; different payload yields `E_IDEMPOTENCY_CONFLICT`.
  - Status: **Aligned (pass)**
  - Mismatch tag: **must-have (pass)**
  - Severity / confidence: **Low / High**
  - Evidence: `src/core/idempotency.ts:7-18,21-38`, `src/core/idempotency.ts:40-57`, `src/core/command-processor.ts:898-901`, `src/core/command-processor.ts:953-957`, `tests/integration/cli/security-and-error-mapping.spec.ts:64-93`, `src/contracts/cli-error.contract.ts:3-13`

- Domain: rate-limit enforcement and error behavior
  - Contract expectation: configurable per-command mutating throttles and auth-failure throttling; over limit must map to `E_RATE_LIMIT_EXCEEDED`.
  - Observed implementation: `checkAndConsumeRateLimit` uses fixed 1-hour sliding window and command-specific limits from `auth.json`; auth failures call `checkAndConsumeRateLimit` with `MAX_AUTH_FAILURES_PER_HOUR=12` and map to `E_RATE_LIMIT_EXCEEDED`.
  - Status: **Aligned (pass)**
  - Mismatch tag: **must-have (pass)**
  - Severity / confidence: **Low / High**
  - Evidence: `src/core/rate-limit.ts:6-54`, `src/core/command-processor.ts:171-172, 890-891, 1030, 1290, 1416`, `src/core/command-processor.ts:607-615`, `src/core/command-processor.ts:614-620`, `tests/integration/cli/security-and-error-mapping.spec.ts:171-192,216-264`, `src/core/auth.ts:165-169`

- Domain: run locking and mutation serialization
  - Contract expectation: prevent concurrent active runs; serialize sensitive state transitions.
  - Observed implementation:
    - active run lock at `data/locks/active-run.lock` uses exclusive create and stale guard (`ACTIVE_LOCK_STALE_MS=60_000`), and clears stale startup lock when stale.
    - per-run mutation lock `.mutation.lock` implements non-blocking acquire with retry+stale cleanup+timeout (`5_000ms` timeout, `50ms` retry, stale cutoff `30_000ms`).
   - Status: **Mostly aligned; implementation exceeds contract with additional operational detail**
   - Mismatch tag: **optional (enhancement detail)**
   - Severity / confidence: **Medium / High**
   - Evidence: `src/store/lock-service.ts:7-29`, `src/core/command-processor.ts:894-916`, `src/core/command-processor.ts:478-509`, `tests/integration/lock/active-run-lock.spec.ts:6-74`
  - Notes:
    - There is no explicit contract text for `.mutation.lock`; semantics are implementation-specific and should be documented for future maintainers.

- Domain: snapshot runtime contract
  - Contract expectation: schema-shaped snapshot with `generatedAt`, `staleAfterSec`, run summary, org view, task board, command feed (latest 50), artifact panel (verified-first order), emitted at `data/snapshot/latest.json`.
  - Observed implementation: builder writes snapshot atomically through contract validation (`snapshotSchema.parse`), uses `snapshotStaleAfterSec=300`, resolves run via active lock/fallback to last run, and sorts artifacts as `verified`, then `pending`, then others.
  - Status: **Aligned (pass)**
  - Mismatch tag: **must-have (pass)**
  - Severity / confidence: **Low / High**
  - Evidence: `src/contracts/snapshot.contract.ts:12,38-95`, `docs/contracts/snapshot.md:3-15`, `src/snapshot/staleness.ts:3-9`, `src/snapshot/builder.ts:13-29,52-150`, `src/contracts/snapshot.contract.ts:40-95`, `src/snapshot/builder.ts:56-57,147-149`

- Domain: docs build/publish artifacts
  - Contract expectation: publish docs assets + contract docs and snapshot to public docs artifact tree with validation checks for required files.
  - Observed implementation: docs build transpiles web app, copies HTML/CSS, copies latest snapshot to `docs/data/snapshot.json`; docs validation checks all required contract/docs artifacts and validates snapshot against schema, including app asset references.
  - Status: **Aligned (pass)**
  - Mismatch tag: **must-have (pass)**
  - Severity / confidence: **Low / High**
  - Evidence: `scripts/build-web.ts:7-34`, `scripts/build-docs.ts:8-30`, `scripts/publish-docs.ts:3-5`, `scripts/validate-docs-artifacts.ts:19-47`, `docs/contracts/snapshot.md:3`, `tests/integration/docs/docs-build-output.spec.ts:10-37`

## Confidence Legend
- High confidence: direct implementation + contract + test coverage matches with minimal ambiguity.
- Medium confidence: behavior is correct but depends on runtime defaults/state (`.ju-office.env`, token resolution) or undocumented locking strategy.

## Net Alignment Result
No blocking implementation-contract gaps found in this pass. The remaining work is documentation precision for two optional areas (status auth defaults and mutation lock semantics) where behavior is defensible but should be explicitly contracted.

## Recommended Follow-up
- Add explicit contract text for `.ju-office.env` status fallback behavior when `readOnlyOpen=false` to remove ambiguity for operators and integrations.
- Add contract text for per-run `.mutation.lock` and stale-timeout behavior to prevent accidental behavioral drift from implementation.
