---
description: Manually halt the sprint (equivalent to a strike-4 halt).
argument-hint: "<reason>"
---

Call the `sprint_halt` MCP tool with `{ "reason": "<the command argument text>" }`. If no
reason was given, ask the human for one before calling the tool — `sprint_halt` requires
a reason.
