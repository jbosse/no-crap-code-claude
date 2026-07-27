---
name: setup
description: One-time project scaffolding for the sprint tooling — docs/, SPEC.md, static-analysis config, mix.exs patch. Run once per Phoenix project before starting a sprint.
---

# Setup skill

Run this once in a Phoenix project before using `/orchestrator` or any sprint tooling.

1. Confirm you're at the root of a Phoenix project (a `mix.exs` file must exist — if it
   doesn't, stop and tell the human this only works inside a Phoenix project).
2. Call the `setup_project` MCP tool. It:
   - Detects the app name from `mix.exs`.
   - Writes `docs/ORCHESTRATION.md`, `docs/architecture.md`, `docs/glossary.md`,
     `docs/project_memory.md`, `docs/styleguide.md`, `SPEC.md`, `.credo.exs`,
     `.dialyzer_ignore.exs`, `.sobelow-conf`, `priv/plts/.gitkeep`, `spawn-agent`,
     `remove-agent` — skipping any that already exist.
   - Patches `mix.exs` (dialyzer config, tooling deps, `precommit` alias) if it can find
     the expected anchors; reports if it couldn't (Phoenix version mismatch or manual
     edits already applied).
   - Patches `.gitignore` with the sprint artifact patterns.
3. Report the tool's result to the human: what was created, what was skipped as
   already-present, whether `mix.exs` was patched.
4. If `mix.exs` could not be auto-patched, show the human the manual instructions
   (the tool's output includes them) and ask them to apply the three changes by hand.
5. Tell the human the next steps:
   ```
   1. mix deps.get            # fetch credo, dialyxir, sobelow, mox
   2. Add `export CLAUDE_CMD="claude"` to .env.local (used by spawn-agent)
   3. Run /orchestrator to start your first sprint
   ```
