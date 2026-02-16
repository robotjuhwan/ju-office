# CLI Error Contract

All errors are emitted to `stderr` as JSON:

```json
{
  "ok": false,
  "error": {
    "code": "E_INVALID_TRANSITION",
    "message": "Cannot resume when run status is executing",
    "details": {
      "command": "resume",
      "runId": "run_20260216T093000Z_ab12cd"
    }
  }
}
```

Exit-code mapping:

- `2` usage
- `3` contract validation
- `4` unauthorized
- `5` rate limit
- `6` idempotency conflict
- `7` invalid transition
- `8` active lock conflict
- `9` storage I/O
- `10` artifact verification
- `11` internal error

Sanitization rule:
- `E_INTERNAL` always emits a generic message (`"Internal error"`) with no raw internal stack/message payload.
