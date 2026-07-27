---
description: Show sprint state summary.
---

Call the `sprint_state_get` MCP tool. Summarize the result for the human: sprint name,
phase, task counts (done vs. total), whether halted, and the current in-flight task's
gate if any. If the tool errors because no sprint is active, tell the human plainly and
suggest `/sprint:resume` if they're on a `sprint/{name}` branch.
