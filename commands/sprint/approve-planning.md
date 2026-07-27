---
description: "Human approval gate: run mix precommit against the planning tree, commit planning artifacts, flip phase -> planning-approved."
---

Call the `sprint_approve_planning` MCP tool with no arguments. Relay its result verbatim
to the human — if it reports the approval was blocked because verify failed, say so
plainly and do not proceed to the next planning step until the human has fixed the
planning artifacts and re-runs this command.
