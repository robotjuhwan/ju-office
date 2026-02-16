# OfficeSnapshot Contract

`OfficeSnapshot` is persisted at `data/snapshot/latest.json` and published to `docs/data/snapshot.json`.

- `generatedAt`: ISO datetime
- `staleAfterSec`: constant `300`
- `runSummary`: run id, status, goal, metrics, optional autopilot summary
  - `autopilot.phase`, `autopilot.state`, `autopilot.qaResult`
  - `autopilot.qaCyclesCompleted`, `autopilot.qaMaxCycles`
  - `autopilot.validationRoundsCompleted`, `autopilot.validationMaxRounds`
  - `autopilot.approvals.{architect,security,code}`
- `orgView`: personas + assignment count + deterministic `character` + deterministic `coordinates`
- `taskBoard`: flattened tasks
- `commandFeed`: latest 50 events
- `artifactPanel`: proofs (verified first)
