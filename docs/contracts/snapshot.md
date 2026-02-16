# OfficeSnapshot Contract

`OfficeSnapshot` is persisted at `data/snapshot/latest.json` and published to `docs/data/snapshot.json`.

- `generatedAt`: ISO datetime
- `staleAfterSec`: constant `300`
- `runSummary`: run id, status, goal, metrics
- `orgView`: personas + assignment count + deterministic `character` + deterministic `coordinates`
- `taskBoard`: flattened tasks
- `commandFeed`: latest 50 events
- `artifactPanel`: proofs (verified first)
