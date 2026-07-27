---
description: "Human approval gate: consolidate task logs, then push+open a GitHub PR (default) or merge into main locally (pass --local)."
argument-hint: "[--local]"
---

If the command arguments include `--local`, call `sprint_approve_close` with
`{ "local": true }`. Otherwise call it with `{ "local": false }` (or omit the field —
both mean the same thing). Relay the resulting PR URL or local-merge confirmation to the
human.
