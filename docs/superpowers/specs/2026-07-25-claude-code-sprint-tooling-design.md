# Claude Code Sprint Tooling — Design

_Port of [`mix_pi_dev_setup`](https://github.com/jbosse/mix_pi_dev_setup) — Pi.dev AI sprint tooling for Phoenix projects — to Claude Code._

## Overview

`mix_pi_dev_setup` is a Mix archive that scaffolds an AI-assisted, Scrum-style sprint
workflow into a Phoenix project: a stateful TypeScript extension (`sprint-orchestrator`)
that owns every deterministic step of the sprint lifecycle, a team of Pi subagents
(Product Owner, Architect, Tester, PM, Builder, Reviewer, Security), skills that define
each role, guardrails that block ad-hoc git mutations and out-of-scope file writes, and
project docs (`ORCHESTRATION.md`, `SPEC.md`, styleguide, etc.).

This spec ports that system to Claude Code — but **not** as a like-for-like Mix
generator. Claude Code has a native distribution mechanism (plugins) that Pi lacks, and
using it eliminates an entire subsystem (`mix pi_dev_update` / drift-checking / vendored
copies) that existed only to work around Pi not having one. The result:

- **One artifact**: a single Claude Code plugin — skills, agents, commands, hooks, and
  one MCP server.
- **One language**: TypeScript throughout (no Elixir generator code).
- **One install step**: `/plugin install`, then ask Claude to run setup once per project.
- **Updates are free**: pulling a plugin update refreshes skills/agents/hooks/MCP tools
  for every project using it — no per-project sync task.

## Goals

- Preserve the sprint lifecycle exactly: planning interview → PO → Architect → Tester
  (planning) → PM → human approval → per-task **Builder → Tester → Reviewer → Security →
  Verify → Commit** loop, one task at a time, in `plan.md` order → final review + polish
  chat → close (PR or local merge).
- Preserve the guardrails: refuse to run the sprint flow on `main`; only sprint tooling
  may `git commit|merge|push|reset|rebase|cherry-pick`; writes are refused outside the
  in-flight task's declared file ownership; `sprint-state.json` is the sole restart
  oracle (never reconstructed from logs); 4-strike retry/escalate/halt; `mix precommit`
  is the single verification gate.
- Preserve the pair-programming variants (`pair-sprint`, `pair-programmer`) and the
  worktree lifecycle scripts (`spawn-agent` / `remove-agent`).

## Non-goals

- No Mix archive, no `mix claude_code_setup` CLI task.
- No support for non-Phoenix/non-Elixir projects — the verification gate stays
  `mix precommit`; scaffolded config (credo/dialyzer/sobelow) is Elixir-specific.
- No attempt to port Pi's own settings (`.pi/settings.json` provider/model config).
  Claude Code's model/provider selection is orthogonal to this plugin.

## Component mapping (Pi → Claude Code)

| Pi concept | Claude Code equivalent |
|---|---|
| `.pi/skills/*/SKILL.md`, invoked `/skill:name` | plugin `skills/*/SKILL.md`, invoked `/name` |
| `.pi/agents/*.md` (`systemPromptMode`, `inheritSkills`, `maxSubagentDepth`, `defaultContext`) | plugin `agents/*.md` (`name`, `description`, `tools`, `model`, `skills`) — Pi-only fields dropped; depth-1 enforced by omitting `Task`/`Agent` from a sprint subagent's `tools:` |
| `.pi/chains/*.chain.md` (e.g. `task-gates`) | folded into the orchestrator skill as an explicit sequence of Task-tool subagent calls — no chain primitive in Claude Code |
| `.pi/extensions/sprint-orchestrator` (`registerTool`, `registerCommand`, guards, `pi.exec`) | plugin `.mcp.json` → Node/TS MCP server (stateful tools) **+** plugin `hooks/hooks.json` (guards, stateless) **+** `commands/sprint/*.md` (thin wrappers around MCP tools) |
| `pi.exec` for internal git/mix calls, gated by an in-memory `AUTHORIZED` flag shared with the bash guard | Node `child_process` calls inside the MCP server, which never touch Claude Code's `Bash` tool — **no cross-process authorization signal needed at all**; the guard only ever sees model-issued `Bash` calls |
| `ctx.ui.setStatus` persistent footer | `statusline.sh` reading `sprint-state.json` (see Open Risks — needs runtime verification) |
| `.pi/settings.json` (`subagents.maxSubagentDepth: 1`) | omit `Task`/`Agent` tool from every sprint subagent's `tools:` list |
| `mix pi_dev_setup` | `setup` skill + `/setup` command → `setup_project` MCP tool |
| `mix pi_dev_update` (dry-run/force, updatable-file-mappings) | **eliminated.** Skills/agents/hooks/MCP tools update via plugin update. Re-running `/setup` is still idempotent (never overwrites) for the small set of files that live in the *project* (docs/, SPEC.md, mix.exs patch, static-analysis config) |

## Architecture

### Plugin layout

```
sprint-tooling/                       # plugin name TBD-at-review, see Open Risks
  .claude-plugin/
    plugin.json                       # name, version, description
    marketplace.json                  # self-hosted marketplace entry (git-based install)
  .mcp.json                           # declares the sprint-orchestrator MCP server
  hooks/
    hooks.json
    session-start.js                  # SessionStart — warns if on main/master
    bash-git-guard.js                 # PreToolUse:Bash — blocks ad-hoc git mutations
    ownership-guard.js                # PreToolUse:Write|Edit — enforces task file ownership
  skills/
    orchestrator/ builder/ architect/ pm/ product-owner/ reviewer/ security/
    tester/ planning-interview/ pair-programmer/ pair-sprint/ styleguide-check/
    setup/                            # NEW — drives one-time project scaffolding
  agents/
    builder.md architect.md architect-final.md pm.md product-owner.md
    reviewer.md security.md tester.md tester-planning.md
  commands/
    sprint/status.md resume.md approve-planning.md approve-close.md halt.md unhalt.md
    setup.md                          # thin wrapper -> setup skill
  mcp/
    package.json  tsconfig.json
    src/
      index.ts                        # registers all MCP tools
      state.ts                        # sprint state machine (near-verbatim port)
      git.ts                          # git helpers (near-verbatim port)
      verify.ts                       # runs `mix precommit` (near-verbatim port)
      paths.ts                        # docs/sprint/{name}/ layout (near-verbatim port)
      setup.ts                        # NEW — setup_project tool logic
      mix-exs-patcher.ts              # NEW — TS port of MixExsPatcher
    templates/                        # bundled scaffolding content
      docs/{ORCHESTRATION,architecture,glossary,project_memory,styleguide}.md
      SPEC.md  credo.exs  dialyzer_ignore.exs  sobelow-conf
      spawn-agent  remove-agent
  statusline.sh
```

### MCP server (`mcp/`)

One server (`sprint-orchestrator`), registered in `.mcp.json`:

```json
{
  "mcpServers": {
    "sprint-orchestrator": {
      "command": "npx",
      "args": ["tsx", "${CLAUDE_PLUGIN_ROOT}/mcp/src/index.ts"]
    }
  }
}
```

No build step — `tsx` runs the TypeScript directly, matching the tradeoff Pi's extension
made by loading `.ts` files without a compile step. Uses `@modelcontextprotocol/sdk` +
`zod` in place of `@mariozechner/pi-coding-agent` + `typebox`.

**Tools** (same behavior/schemas as the Pi extension unless noted):

| Tool | Notes |
|---|---|
| `sprint_start` | unchanged — refuses unless `interviewConfirmed: true` |
| `sprint_state_get` | unchanged |
| `sprint_tasks_seed` | unchanged |
| `gate_pass` | unchanged — mechanical gate advance, agents report what ran, not what's next |
| `task_log_append` | unchanged |
| `strike_record` | unchanged — 4-strike halt |
| `sprint_state_unhalt` | unchanged |
| `verify_run` | unchanged — runs `mix precommit`, auto-applies outcome to the in-flight task |
| `commit_task` | unchanged — refuses unless every gate is green; "no stealth edits" check unchanged |
| `consolidate_logs` | unchanged |
| `sprint_merge` | unchanged |
| `sprint_approve_planning` | **NEW** — absorbs the old `/sprint:approve-planning` command handler (run verify, commit planning artifacts, flip phase) |
| `sprint_approve_close` | **NEW** — absorbs `/sprint:approve-close` (consolidate logs, then PR-via-`gh` or `--local` merge, now a `local: boolean` param) |
| `sprint_halt` | **NEW** — absorbs the old `/sprint:halt` command handler (manually sets `state.halted`, distinct from `strike_record`'s automatic strike-4 halt) |
| `setup_project` | **NEW** — see below |

`state.ts`, `git.ts`, `verify.ts`, `paths.ts` are near-verbatim ports: same `Gate` type
and `GATE_SEQUENCE`, same `LEGAL_EDGES`, same strike/halt logic, same
`docs/sprint/{name}/` file layout, same `mix precommit` default verify step.

### `setup_project` tool (replaces the Mix generator)

Invoked once per project via the `setup` skill / `/setup` command. Behavior:

1. Read `mix.exs` at cwd; extract the app name via regex on `app: :foo,` (Phoenix
   `mix.exs` always has this near the top of `project/0`).
2. Derive `__APP_MODULE__` / `__APP_WEB_MODULE__` / `__APP_NAME__` / `__APP_WEB_NAME__` /
   `__GENERATED_DATE__` substitutions — same token scheme as the original.
3. Render `mcp/templates/**` with those substitutions and write into the project:
   `docs/*.md`, `SPEC.md`, `.credo.exs`, `.dialyzer_ignore.exs`, `.sobelow-conf`,
   `priv/plts/.gitkeep`, `spawn-agent`, `remove-agent` (chmod +x after writing).
   **Never overwrites an existing file** — same safety rule as `Mix.Generator.create_file`.
4. Patch `mix.exs`: add `dialyzer:` config, add `:credo`/`:dialyxir`/`:sobelow`/`:mox`
   deps, expand the `precommit:` alias — a TS port of `MixExsPatcher`'s anchor-based,
   idempotent string/regex patches (same three anchors: `listeners:
   [Phoenix.CodeReloader]` / `deps: deps(),` / `deps: deps()` fallback for Phoenix 1.7
   shape; same bandit-dep anchor for the deps list; same precommit-alias regex).
5. Patch `.gitignore` with the sprint artifact patterns (idempotent — checks for the
   sentinel line first).
6. Report a summary (created / skipped-already-exists / manual-instructions-if-no-anchor-found),
   mirroring the original's shell output.

Since this runs as an MCP tool invoked from inside a live Claude Code session (not a
blind CLI command), it can also *ask* before overwriting or confirm the detected app
name — an improvement over the original's non-interactive Mix task.

### Hooks (`hooks/hooks.json`)

All three guards are **stateless** — a good match for Claude Code's per-invocation hook
subprocess model (unlike Pi's in-memory `ACTIVE_SPRINT` cache, every hook invocation
re-reads `sprint-state.json` from disk, which is strictly simpler and can't go stale).

- **`SessionStart` → `session-start.js`**: run `git rev-parse --abbrev-ref HEAD`; if
  `main`/`master`, return `additionalContext` warning ("sprint work happens on
  `sprint/{name}}`, use `/sprint:resume` or the orchestrator's `sprint_start`"). No
  persistent status here — that's `statusline.sh`'s job (see Open Risks).
- **`PreToolUse` matcher `Bash` → `bash-git-guard.js`**: same `extractGitSubcommand`
  parsing and `BLOCKED_GIT_SUBCOMMANDS` list (`commit|merge|push|reset|rebase|cherry-pick`)
  as `guards.ts`. Blocks by returning a deny decision with a reason. **No authorization
  flag** — the MCP server's own git calls go through Node `child_process`, never through
  Claude Code's `Bash` tool, so this hook only ever sees model-issued commands and there
  is nothing to allow through.
- **`PreToolUse` matcher `Write|Edit` → `ownership-guard.js`**: same `pathOwnedBy` logic
  (exact match / directory-prefix / reverse-parent-directory match), same
  sprint-artifact-always-allowed rule, same planning-phase-allowed-prefixes rule
  (`docs/`, `test/`, `config/`, `priv/` only, before tasks are seeded), same
  single-in-flight-task ownership enforcement and "belongs to a later task" messaging.
  **Dropped**: the "extension source is never writable" rule — moot, since the plugin's
  own source lives under `${CLAUDE_PLUGIN_ROOT}`, entirely outside the project directory
  the model is editing, so it's already unreachable via `Write`/`Edit`.

### Skills & agents

- Skills port close to verbatim. `/skill:name` → `/name` throughout (Claude Code invokes
  plugin skills without a `skill:` prefix). `subagent({...})` call syntax is rewritten
  as "invoke the Task tool with `subagent_type: "<name>"`". `subagent({ chain:
  "task-gates", task })` is rewritten as an explicit 4-step sequence
  (builder → tester → reviewer → security) written directly into the orchestrator skill,
  since Claude Code has no chain primitive.
- Agent frontmatter keeps `name`, `description`, `tools`, `model`, `skills` — all
  supported directly by plugin-shipped agents. Dropped: `systemPromptMode`,
  `inheritProjectContext`, `inheritSkills`, `defaultContext` (no equivalent needed —
  a Claude Code subagent's body already fully replaces the default prompt and always
  gets a fresh context per invocation) and `maxSubagentDepth` (enforced by simply never
  including `Task`/`Agent` in a sprint subagent's `tools:` list — plugin agents can't
  declare `hooks`/`mcpServers`/`permissionMode` per Claude Code's plugin-agent security
  restrictions, which is fine, they don't need to). `tools:` lists reference the
  scoped MCP tool names (see Open Risks — exact scoping format needs runtime
  verification).

### Commands (`commands/sprint/*.md`)

Thin wrappers, one per Pi command, each naming the exact MCP tool to call and how to
relay its output to the human:

| Command | Calls |
|---|---|
| `/sprint:status` | `sprint_state_get`, formats a summary |
| `/sprint:resume` | reads current branch, confirms sprint context (no dedicated tool needed — MCP tools are already stateless/branch-driven via `paths.ts`) |
| `/sprint:approve-planning` | `sprint_approve_planning` |
| `/sprint:approve-close [--local]` | `sprint_approve_close({ local })` |
| `/sprint:halt` | `sprint_halt` |
| `/sprint:unhalt` | `sprint_state_unhalt` |

### `docs/` templates

Ported with terminology swapped: `pi-subagents` → "the Task tool"; `/skill:name` →
`/name`; "sprint-orchestrator extension" → "sprint-orchestrator MCP server + hooks";
"subagent shims in `/.pi/agents/`" → "agents in the plugin's `agents/` directory".
Content and process (branching, commit policy, planning phase, dev phase, failure/retry,
final review) are otherwise unchanged — the *lifecycle* isn't Pi-specific, only the
plumbing under it is.

### `spawn-agent` / `remove-agent`

Same worktree lifecycle scripts (branch/worktree creation, `.env.local` merging, DB/S3
bucket/port derivation, `start.sh` generation). `PI_CMD` → `CLAUDE_CMD`; the final `eval
"$PI_CMD"` launch line becomes `eval "$CLAUDE_CMD"` (e.g. `export CLAUDE_CMD="claude"`).
Everything else is unchanged.

## Open risks / to verify during implementation

1. **Scoped MCP tool name format.** Docs state plugin-bundled MCP tools are addressed as
   `mcp__plugin_<plugin-name>_<server-name>__<tool>` — needs confirmation against a real
   running instance before finalizing every agent's `tools:` list and every hook's `if`/
   matcher field that targets `sprint-orchestrator` tools.
2. **Persistent status widget.** Plugin `settings.json` only documents `agent` and
   `subagentStatusLine` keys — unclear whether a plugin can install a *global* terminal
   statusline (Pi's `ctx.ui.setStatus` equivalent) the way a user's own `~/.claude/settings.json
   statusLine` can. If not, drop `statusline.sh` and rely on the `SessionStart` warning +
   `/sprint:status` on demand — a reasonable fallback, not a functional gap.
3. **`npx tsx` cold-start cost.** Running the MCP server via `npx tsx` avoids a build
   step but re-resolves/transpiles on every session start. Acceptable for now; revisit
   with a prebuilt `dist/` + plain `node` invocation if startup latency proves annoying.
4. **Plugin name and distribution.** Proposing `sprint-tooling` as the plugin name and a
   self-hosted git repo + `marketplace.json` for `/plugin marketplace add` (matching how
   this user already consumes the `superpowers` plugin). Final name/repo location is the
   user's call.

## Testing strategy

- **MCP server**: `vitest` unit tests — state machine transitions/strikes/legal edges
  (port of the intent behind `state.ts`'s design, even though the original had no
  Elixir-side tests for it since it lived in the extension), `mix-exs-patcher.ts`
  idempotency (port of `test/pi_dev_setup/mix_exs_patcher_test.exs` fixtures),
  `setup_project` template rendering + overwrite-safety (port of
  `test/pi_dev_setup/templates_test.exs`).
- **Guards**: `pathOwnedBy` and `extractGitSubcommand` are pure functions — unit-test
  directly. The hook I/O contract itself (stdin/stdout JSON, exit codes) is verified
  manually against a real Claude Code session, not through unit tests.
- **End-to-end**: once implemented, manually run the full planning → dev-loop → final
  review → close cycle against a scratch Phoenix project.
