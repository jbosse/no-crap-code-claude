---
description: Resume the sprint on the current branch.
---

Check the current git branch. If it matches `sprint/{name}`, call `sprint_state_get` to
confirm `sprint-state.json` exists for that name and report the phase to the human. If
the branch doesn't match `sprint/{name}`, tell the human they're not on a sprint branch.
