# Ju Office MVP Scope

This MVP delivers a deterministic TypeScript CLI (`ju`) with file-based orchestration state and a static GitHub Pages UI.

Included commands:
- `start`
- `status`
- `pause`
- `resume`
- `reprioritize`
- `message`
- `stop`

Security and policy constraints:
- mutating commands (`start|pause|resume|reprioritize|message|stop`) require `--actor` + `--auth-token`
- actor tokens are resolved from environment variables declared in `config/auth.json > actorTokenEnv`
- status visibility is controlled by `config/auth.json > readOnlyOpen` (default: closed)
- `message --complete-task` requires explicit `complete-task` permission for the actor
- artifact proofs are validated against local `artifacts/` policy and HTTPS allowlist/timeout policy

All mutating commands rebuild `data/snapshot/latest.json`, and docs publishing copies that snapshot to `docs/data/snapshot.json`.
