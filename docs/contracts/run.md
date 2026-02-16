# Run Contract

`Run` persisted at `data/runs/<runId>/run.json`.

- `runId`: `^run_[0-9]{8}T[0-9]{6}Z_[a-z0-9]{6}$`
- `goal`: 10-280 characters
- `status`: `queued|planning|executing|verifying|paused|blocked|stopped|failed|completed`
- `personas`: exactly 5 personas (1 CEO + 4 workers)
- `metrics`: `{ tasksTotal, tasksDone, proofsVerified }`
- `createdAt`, `updatedAt`: ISO datetime
