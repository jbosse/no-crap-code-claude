---
description: Clear the halted flag after a human-approved fix.
argument-hint: "<what was fixed>"
---

Call the `sprint_state_unhalt` MCP tool with `{ "reason": "<the command argument text>" }`.
If no reason was given, ask the human to describe what was fixed before calling the tool
— `sprint_state_unhalt` requires a non-empty reason. Relay the result, including whether
an in-flight task was reset to the builder gate.
