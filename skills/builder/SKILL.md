---
name: builder
description: Flesh out the task's pending test stubs into real assertions, then writes production code to make them pass. Bound by declared file ownership and the full styleguide. Use during each development task after the Orchestrator has assigned it.
---

# 🔨 Builder skill

Read these **in full** before writing any code:

1. `/docs/styleguide.md` ← every rule applies
2. `/docs/glossary.md`
3. `/AGENTS.md` — Phoenix 1.8 / LiveView / Elixir baseline (inherited wholesale)
4. `/docs/sprint/current/architecture.md`
5. `/docs/sprint/current/reviewer-checklist.md`
6. Your task entry in `/docs/sprint/current/plan.md` (especially `Files:`)

Then consult the `styleguide-check` skill (injected into your agent shim) for the short checklist you will self-audit against before declaring done.

## Workflow

1. Read the task's pending test stubs (`@tag :pending`, comment-only bodies written by Tester during planning) and your task entry in `plan.md`. Understand what each AC requires.
2. Flesh out the stubs into real, asserting test code — remove `@tag :pending`, add the real `alias`/setup/assertions — **before** writing the production code they exercise. Write these tests to assert the AC's actual required behavior, not to fit whatever the implementation ends up doing.
3. Write production code **only inside your task's declared file ownership** (`Files:` in `plan.md`). Ownership is not restricted to `/lib/` — it may include `/test/`, `/priv/repo/migrations/`, `/config/runtime.exs`, `/assets/`, etc., as PM declared; the test files you just fleshed out fall under this same ownership. The extension blocks `write`/`edit` outside this list — if a block happens, stop and escalate to Orchestrator; do NOT "find another file".
4. Run the tests you wrote and iterate until they pass against your implementation.
5. Self-audit against the reviewer checklist + styleguide.
6. Draft a commit message (Orchestrator finalizes) in the format from `/docs/ORCHESTRATION.md`.
7. Call `gate_pass(taskId, "builder")` to hand the task to the Tester, then return.

## Migrations, generators, and other bash-driven writes

Some changes come from `mix` generators (`mix ecto.gen.migration`, `mix phx.gen.*`). Their output filenames include timestamps that PM cannot predict at plan time. Convention:

- PM declares the **directory prefix** in `Files:` — e.g. `priv/repo/migrations/` — rather than an exact filename.
- Builder runs the generator via `bash`: `mix ecto.gen.migration create_forecast_entries`. This creates the skeleton file inside the declared prefix.
- Builder then uses `edit` / `write` on the newly-created file to fill in the migration body. The ownership guard accepts it because the path starts with a declared prefix.
- **Never** rename or move generator output to dodge ownership. If a generator emits outside your declared prefixes, stop and escalate to Orchestrator.

## Hard rules

- **Tests assert the AC, not the implementation.** Don't write (or weaken) an assertion just to make it match whatever the code currently returns — the test's job is to pin down required behavior, same discipline as if Tester had written it.
- **Never write outside declared file ownership.** Extension enforces.
- **No new GoF pattern without an existing ADR or Architect design reference.** No speculative patterns.
- **Layering**: `my_app_web/` stays thin (parse, authorize, dispatch); domain code depends only on ports (behaviours); vendor SDKs / `Req` calls live only in `adapters/`.
- **CQS**: Commands = single `execute/2`, writes inside one `Ecto.Multi`, returns `{:ok, _} | {:error, struct}`. Queries = single `run/2`, no writes.
- **`%Ctx{}`**: first-arg everywhere once established; call `MyApp.Ctx.stamp_metadata/1` at the boundary. If `%Ctx{}` has not yet been established in this project, follow the sprint's architecture.md for how context is threaded.
- **Error handling**: no `raise "string"`; no wildcard `rescue _ -> ...`; adapters wrap vendor exceptions into domain error structs under `<context>/errors/`; `Logger.error` before returning `{:error, _}`.
- **Logging**: `Logger` only. No `IO.puts`, no `IO.inspect`, no `dbg/1` in committed code.
- **Boundary validation**: every external input goes through a Contract (embedded-schema changeset). Domain functions never accept raw `params`.
- **Config**: `System.get_env/1` only in `runtime.exs`; `Application.get_env/2` only in `MyApp.Config` (once established).
- **Docs**: `@moduledoc` on every module; `@doc` + `@spec` on every public function; inline comments are why-not-what only.
- **On retry (strikes 1–3)**: you receive the specific feedback that caused the fail. Address it directly — this may mean fixing the test, the production code, or both, depending on what Tester's feedback identifies as wrong. Do NOT rewrite from scratch unless feedback says so.

## Required tool calls

- `task_log_append` with agent=`builder` for each meaningful step (start, tests fleshed out, implementation draft, self-audit, handoff).
- Call `gate_pass(taskId, "builder")` exactly once, when done — never any other gate, never `strike_record`.
