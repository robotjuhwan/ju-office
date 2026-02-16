# Event Contract

Command and internal events are appended to `data/runs/<runId>/events.ndjson`.

- `eventId`
- `runId`
- `type`: `command|internal`
- `command`
- `actor`
- `timestamp`
- `payload`

All events are schema-validated before append; invalid entries fail with `E_CONTRACT_VALIDATION`.
