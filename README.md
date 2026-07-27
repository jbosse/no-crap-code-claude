# No Crap Claude

A Claude Code plugin that ports [Pi.dev](https://pi.dev)'s AI-assisted Scrum-style
sprint tooling for Phoenix projects: a planning interview, a subagent team (Product
Owner / Architect / Tester / PM / Builder / Reviewer / Security), a per-task gate
chain, and guardrails enforced by hooks plus an MCP server. It drives a full sprint
lifecycle — planning, delegated implementation, review, and merge — while keeping git
mutations funneled through deterministic tools instead of ad-hoc commands.

## Install

Add this repo as a plugin marketplace, then install the plugin:

```
/plugin marketplace add <path-or-url-to-this-repo>
/plugin install no-crap-claude
```

For local development, you can instead point Claude Code at a checkout directly with
`--plugin-dir <path-to-this-repo>`.

## Required one-time step: install the MCP server's dependencies

The plugin's `.mcp.json` runs the sprint-orchestrator MCP server via
`npx tsx ${CLAUDE_PLUGIN_ROOT}/mcp/src/index.ts`. There is no bundled or prebuilt
`dist/` — the server runs straight from TypeScript source — so its Node dependencies
(`@modelcontextprotocol/sdk`, `zod`) must be installed once after the plugin is
installed:

```
cd mcp && npm install
```

This step is currently mandatory. Skipping it will cause the MCP server to fail to
start (it can't resolve its imports).

Node 22+ is required (the MCP server relies on `fs.globSync` and `Dirent.parentPath`).

## Use it

1. Inside a Phoenix project, run `/setup` (or ask Claude to "set up the sprint tooling
   here") to scaffold the project-specific files: `docs/`, `SPEC.md`, static-analysis
   config, and a `mix.exs` patch.
2. Run `/orchestrator` to start a sprint. It runs the planning interview, delegates
   each role to a fresh subagent, and walks the sprint through its gate chain to
   completion.
