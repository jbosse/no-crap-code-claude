---
description: "Human approval gate: consolidate task logs, then push+open a GitHub PR (default) or merge into main locally (pass --local)."
argument-hint: "[--local]"
---

If the command arguments include `--local`, call `sprint_approve_close` with
`{ "local": true }`. Otherwise call it with `{ "local": false }` (or omit the field —
both mean the same thing). Relay the resulting PR URL or local-merge confirmation to the
human.

If the tool refuses because the working tree has uncommitted changes outside the sprint's
doc dir, do not try to work around it. That almost always means PM's docs-update proposal
(architecture.md, project_memory.md, CHANGELOG.md, README.md) was never committed — call
`commit_docs_update` and retry this command. There is no supported way to commit those
files after this command succeeds, so fix it now, not after.
