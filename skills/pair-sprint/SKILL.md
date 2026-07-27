---
name: pair-sprint
description: Whole-sprint pair-programming mode. Identical to /orchestrator for planning, approval gates, final review, and close — but every dev task is ping-pong pair-programmed with the human in the parent session instead of delegated to the builder/tester chain. Reviewer and Security still run as fresh subagents.
---

# 🏓🧭 Pair-sprint skill

You drive a full sprint, but the human is your pair for the development work.
**Load `/orchestrator` and follow it for everything this file does not
override.** The planning interview, the planning-phase subagents, the human
approval gates, task seeding, final review, polish, and close are all
identical — including every HARD-GATE.

The one substitution: **the dev loop**. Tasks are not dispatched to the
`task-gates` chain. You and the human ping-pong them in this session, then
fresh subagent eyes review the result.

## What stays exactly the same as /orchestrator

- Planning interview first, always. `sprint_start` refuses without it.
- PO → human story approval → PO mode 2 → Architect → Tester-planning → PM →
  `/sprint:approve-planning` → PM seeds tasks.
- Tasks run strictly in plan.md order, one at a time.
- All deterministic steps go through the extension tools; if a tool refuses,
  trust it.
- Final review (architect-final), polish loop, `/sprint:approve-close`.

## The paired dev loop (replaces the task-gates chain)

For each task, in plan.md order:

```
task_log_append(taskId, "orchestrator", 1, "pair session start")
# 1. Set the table: read the task's plan.md entry; tell the human the title,
#    story, ACs, and declared Files. Ask who serves first.
# 2. Ping-pong per /pair-programmer (load it now if you haven't):
#    failing test → minimum green → refactor → swap, one AC at a time,
#    chatting at every seam. Both of you stay inside the declared Files.
# 3. When every AC is covered and the suite is green, ask the human
#    explicitly: "All ACs covered, tests green — do you sign off on
#    builder and tester gates for {taskId}?"
# 4. On an explicit yes (and ONLY then):
gate_pass(taskId, "builder")
gate_pass(taskId, "tester")
task_log_append(taskId, "orchestrator", 1, "pair sign-off: builder+tester passed")
# 5. Fresh eyes — this is not optional, pairing earns no review exemption:
# Invoke the Task tool two times in sequence for this task, waiting for each
# to finish before starting the next:
#   1. subagent_type: "reviewer" — Gate 2, calls gate_pass(taskId, "reviewer") or strike_record
#   2. subagent_type: "security" — Gate 3, calls gate_pass(taskId, "security") or strike_record
# Each step reads the task's plan.md entry and the prior step's log itself —
# you (the orchestrator) never re-send file contents between them.
# 6. Gate 4:
verify_run        # green auto-advances to commit; red auto-records a strike
commit_task(taskId)
# 7. Announce the commit, then move to the next task.
```

## Strike protocol, paired flavour

A reviewer/security strike (or a red verify) resets the task to the `builder`
gate — same state machine as the autonomous flow. The difference is the retry:

- **Strike 1–2**: bring the findings back to the pairing session. Read the
  gate child's log, summarize the findings to the human, and ping-pong the
  fixes (findings become the next serves). Then re-request sign-off, re-run
  `gate_pass(builder)` + `gate_pass(tester)`, and re-run the reviewer +
  security sequence.
- **Strike 3**: same as orchestrator — invoke the Task tool with
  `subagent_type: "architect"` and the prompt "escalation mode…", then bring
  the directive into the pairing session.
- **Strike 4**: sprint halts. Surface to the human; `/sprint:unhalt` after the
  fix is agreed.

## Hard rules (in addition to the orchestrator's)

- **Never call `gate_pass` without the human's explicit sign-off** in chat for
  that specific task. "Looks done" from you is not a verdict; the human is the
  tester of record in this mode.
- **Never skip the reviewer + security sequence**, even if the human offers.
  If they insist, record their instruction with `task_log_append` first so
  the audit trail shows who waived it — then follow their instruction.
- **You may write code in this mode** (unlike plain orchestrator) but only
  during your ping-pong turns, only inside the current task's declared Files,
  and never during planning or final-review phases.
- All the pair-programmer turn rules apply: stop on the human's turn, never
  write ahead of the test, show red before green.
