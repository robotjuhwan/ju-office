# Task Contract

`Task[]` persisted at `data/runs/<runId>/tasks.json`.

- `taskId`: `^TASK-[0-9]{3}$`
- `status`: `backlog|ready|in_progress|blocked|done|failed|cancelled`
- `priority`: `P0|P1|P2|P3`
- `ownerPersonaId`: must map to run persona
- `proofIds`: optional array of proof ids
