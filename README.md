# Ju Office

Deterministic CLI orchestration for investor-style execution flow:

`goal -> tasks -> proof -> qa -> review approvals`

---

## Quick Start (repo-local)

```bash
git clone https://github.com/robotjuhwan/ju-office.git
cd ju-office
npm ci

npm run ju:init
npm run ju:setup
npm run ju:auto -- --goal "Build web snake game MVP with score and restart"
npm run ju -- status
```

---

## Global CLI Install (recommended)

One-time install:

```bash
git clone https://github.com/robotjuhwan/ju-office.git
cd ju-office
npm ci
npm run link:global
```

Then you can run `ju` from any folder.

Example in a brand-new empty folder:

```bash
mkdir my-ju-workspace
cd my-ju-workspace

ju init
ju setup
ju autopilot --goal "Build web snake game MVP with keyboard controls, score, and restart"
ju status
```

Uninstall global link:

```bash
cd /path/to/ju-office
npm run unlink:global
```

---

## Core Commands

- `ju init` — bootstrap minimal Ju Office project files in current directory
- `ju setup` — create `.ju-office.env` tokens for local auth
- `ju autopilot --goal "<text>"` — start Ju run + (default) launch background Codex worker
- `ju status` — show active/latest run and snapshot
- `ju pause|resume|reprioritize|message|qa|review|stop` — advanced lifecycle controls

### Autopilot delegation flags

- `--delegate codex` (default) → launch `codex exec` worker in background
- `--delegate none` → only create Ju run (no external worker launch)
- `--delegate-target-dir <path>` → directory where delegated Codex worker should run
- `--delegate-model <model>` → optional model override for delegated Codex worker

For MVP details, see `docs/mvp-scope.md`.
