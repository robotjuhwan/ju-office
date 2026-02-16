# Ju Office MVP Scope

This MVP delivers a deterministic TypeScript CLI (`ju`) with file-based orchestration state and a static GitHub Pages UI.

Included commands:
- `start`
- `status`
- `pause`
- `resume`
- `reprioritize`
- `message`
- `qa`
- `review`
- `stop`

Security and policy constraints:
- mutating commands (`start|pause|resume|reprioritize|message|qa|review|stop`) require `--actor` + `--auth-token`
- actor tokens are resolved from environment variables declared in `config/auth.json > actorTokenEnv`
- reviewer-role authorization is enforced by `config/auth.json > reviewApprovers` (architect/security/code)
- status visibility is controlled by `config/auth.json > readOnlyOpen` (default: closed)
- `message --complete-task` requires explicit `complete-task` permission for the actor
- `review` requires `qa --result pass` before approvals can be recorded
- autopilot-enabled completion requires verified proof gate + `qa pass` + `review` approvals from `architect`, `security`, and `code`
- `qa` tracks cycles (`maxCycles=5`) and fails the run when the same failure repeats 3 times or cycles exceed budget
- `review` tracks validation rounds (`maxRounds=3`) and fails the run when rejection budget is exceeded
- artifact proofs are validated against local `artifacts/` policy and HTTPS allowlist/timeout policy

Start flow also writes `.omx/plans/autopilot-spec.md`, `.omx/plans/autopilot-impl.md`, and `.omx/plans/autopilot-checklist.md`.

All mutating commands rebuild `data/snapshot/latest.json`, and docs publishing copies that snapshot to `docs/data/snapshot.json`.
