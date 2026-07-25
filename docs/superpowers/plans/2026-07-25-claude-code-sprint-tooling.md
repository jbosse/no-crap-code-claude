# Claude Code Sprint Tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `mix_pi_dev_setup` (Pi.dev AI sprint tooling for Phoenix projects) into a single Claude Code plugin named `no-crap-claude` — skills, agents, commands, hooks, and one MCP server — replacing the original's Mix-archive-plus-vendored-copies architecture.

**Architecture:** A shared `lib/` of pure TypeScript modules (sprint state machine, path layout, ownership/git-guard predicates) is consumed by both an MCP server (`mcp/`, stateful tools run via `npx tsx`) and three Claude Code hooks (`hooks/`, stateless per-invocation scripts). Skills, agents, and slash commands are markdown, ported from the Pi originals with Pi-specific syntax (`/skill:name`, `subagent({...})`, chain files) rewritten to Claude Code equivalents (`/name`, Task-tool calls, inlined sequences).

**Tech Stack:** TypeScript (Node 20+), `@modelcontextprotocol/sdk`, `zod`, `vitest` for unit tests, `tsx` for no-build-step execution, Claude Code plugin manifest format (`.claude-plugin/plugin.json`, `.mcp.json`, `hooks/hooks.json`).

## Global Constraints

- No build step: every entry point (`mcp/src/index.ts`, each `hooks/*.ts`) is run directly via `npx tsx`, matching the tradeoff the original Pi extension made loading `.ts` files unbuilt.
- Relative imports across `.ts` files use the `.js`-extension convention (`from "../../lib/state.js"` for a file physically named `state.ts`) — this is what `tsx`/Node ESM resolution expects and matches the pattern already used in Pi's original extension source.
- `sprint-state.json` remains the sole source of truth for sprint/task state — never reconstructed from logs, in either the MCP server or the hooks.
- The verification gate is always exactly `mix precommit` (one step) — never reimplement its constituent steps elsewhere.
- File-ownership and git-mutation guards are **stateless**: every hook invocation re-reads `sprint-state.json` from disk; no in-memory caching across invocations (there is no "across invocations" — each hook call is a fresh process).
- Plugin name is `no-crap-claude` everywhere a name is required (`plugin.json`, `marketplace.json`, MCP server key).
- Never overwrite an existing file during `setup_project` — matches `Mix.Generator.create_file`'s behavior in the original.

---

## File Structure

```
no-crap-claude/
  .claude-plugin/
    plugin.json
    marketplace.json
  .mcp.json
  lib/
    paths.ts
    state.ts
    ownership.ts
    git-guard.ts
  mcp/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      git.ts
      verify.ts
      mix-exs-patcher.ts
      setup.ts
      index.ts
    src/__tests__/
      state.test.ts
      ownership.test.ts
      git-guard.test.ts
      mix-exs-patcher.test.ts
      setup.test.ts
    templates/
      docs/ORCHESTRATION.md
      docs/architecture.md
      docs/glossary.md
      docs/project_memory.md
      docs/styleguide.md
      SPEC.md
      credo.exs
      dialyzer_ignore.exs
      sobelow-conf
      spawn-agent
      remove-agent
  hooks/
    hooks.json
    session-start.ts
    bash-git-guard.ts
    ownership-guard.ts
  skills/
    orchestrator/SKILL.md
    builder/SKILL.md
    architect/SKILL.md
    pm/SKILL.md
    product-owner/SKILL.md
    reviewer/SKILL.md
    security/SKILL.md
    tester/SKILL.md
    planning-interview/SKILL.md
    pair-programmer/SKILL.md
    pair-sprint/SKILL.md
    styleguide-check/SKILL.md
    setup/SKILL.md
  agents/
    builder.md
    architect.md
    architect-final.md
    pm.md
    product-owner.md
    reviewer.md
    security.md
    tester.md
    tester-planning.md
  commands/
    sprint/status.md
    sprint/resume.md
    sprint/approve-planning.md
    sprint/approve-close.md
    sprint/halt.md
    sprint/unhalt.md
    setup.md
```

---

### Task 1: Plugin manifest skeleton

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `.gitignore`
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/vitest.config.ts`

**Interfaces:**
- Produces: an `mcp/` TypeScript project that later tasks add source files to; `npm test` runs vitest from `mcp/`.

- [ ] **Step 1: Write the plugin manifest**

```json
// .claude-plugin/plugin.json
{
  "name": "no-crap-claude",
  "displayName": "No Crap Claude",
  "version": "0.1.0",
  "description": "AI-assisted Scrum-style sprint tooling for Phoenix projects: planning interview, subagent team (PO/Architect/Tester/PM/Builder/Reviewer/Security), per-task gate chain, and guardrails enforced by hooks + an MCP server.",
  "author": { "name": "Jimmy Bosse" },
  "license": "MIT",
  "keywords": ["sprint", "phoenix", "elixir", "orchestration", "tdd"]
}
```

- [ ] **Step 2: Write the self-hosted marketplace entry**

```json
// .claude-plugin/marketplace.json
{
  "name": "no-crap-claude-dev",
  "owner": { "name": "Jimmy Bosse" },
  "plugins": [
    {
      "name": "no-crap-claude",
      "source": "./",
      "description": "AI-assisted Scrum-style sprint tooling for Phoenix projects."
    }
  ]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
# .gitignore
node_modules/
mcp/dist/
*.log
.DS_Store
```

- [ ] **Step 4: Write the MCP package manifest**

```json
// mcp/package.json
{
  "name": "no-crap-claude-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 5: Write `mcp/tsconfig.json`**

```json
// mcp/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".."
  },
  "include": ["src/**/*.ts", "../lib/**/*.ts"]
}
```

- [ ] **Step 6: Write `mcp/vitest.config.ts`**

```ts
// mcp/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Install dependencies and verify the test runner boots**

Run: `cd mcp && npm install && npm test`
Expected: vitest reports "No test files found" (exit 0) — confirms the toolchain works before any source exists.

- [ ] **Step 8: Commit**

```bash
git add .claude-plugin .gitignore mcp/package.json mcp/package-lock.json mcp/tsconfig.json mcp/vitest.config.ts
git commit -m "Scaffold plugin manifest and MCP TypeScript project"
```

---

### Task 2: `lib/paths.ts` — sprint directory layout

**Files:**
- Create: `lib/paths.ts`
- Create: `mcp/src/__tests__/paths.test.ts`

**Interfaces:**
- Produces:
  - `SPRINT_ROOT_REL = "docs/sprint"`
  - `interface SprintPaths { root, state, sprintLog, sprintTasksLog, logsDir, planningSummary, userStories, architecture, reviewerChecklist, spec, plan, sprintReview: string }`
  - `sprintPaths(cwd: string, sprintName: string): SprintPaths`
  - `ensureSprintDirs(paths: SprintPaths): void`
  - `taskLogPath(paths: SprintPaths, taskId: string, agent: string, attempt: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// mcp/src/__tests__/paths.test.ts
import { describe, it, expect } from "vitest";
import { sprintPaths, taskLogPath, SPRINT_ROOT_REL } from "../../../lib/paths.js";

describe("sprintPaths", () => {
  it("builds the full sprint directory layout under docs/sprint/{name}", () => {
    const paths = sprintPaths("/repo", "fix-sorting");
    expect(SPRINT_ROOT_REL).toBe("docs/sprint");
    expect(paths.root).toBe("/repo/docs/sprint/fix-sorting");
    expect(paths.state).toBe("/repo/docs/sprint/fix-sorting/sprint-state.json");
    expect(paths.sprintLog).toBe("/repo/docs/sprint/fix-sorting/sprint.log");
    expect(paths.sprintTasksLog).toBe("/repo/docs/sprint/fix-sorting/sprint-tasks.log");
    expect(paths.logsDir).toBe("/repo/docs/sprint/fix-sorting/logs");
    expect(paths.planningSummary).toBe("/repo/docs/sprint/fix-sorting/planning-summary.md");
    expect(paths.userStories).toBe("/repo/docs/sprint/fix-sorting/user-stories.md");
    expect(paths.architecture).toBe("/repo/docs/sprint/fix-sorting/architecture.md");
    expect(paths.reviewerChecklist).toBe("/repo/docs/sprint/fix-sorting/reviewer-checklist.md");
    expect(paths.spec).toBe("/repo/docs/sprint/fix-sorting/spec.md");
    expect(paths.plan).toBe("/repo/docs/sprint/fix-sorting/plan.md");
    expect(paths.sprintReview).toBe("/repo/docs/sprint/fix-sorting/sprint-review.md");
  });

  it("zero-pads the attempt number in task log filenames", () => {
    const paths = sprintPaths("/repo", "fix-sorting");
    expect(taskLogPath(paths, "task-3", "builder", 1)).toBe(
      "/repo/docs/sprint/fix-sorting/logs/task-3-builder-01.log",
    );
    expect(taskLogPath(paths, "task-3", "builder", 12)).toBe(
      "/repo/docs/sprint/fix-sorting/logs/task-3-builder-12.log",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL — `lib/paths.ts` does not exist (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// lib/paths.ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const SPRINT_ROOT_REL = "docs/sprint";

export interface SprintPaths {
  root: string;
  state: string;
  sprintLog: string;
  sprintTasksLog: string;
  logsDir: string;
  planningSummary: string;
  userStories: string;
  architecture: string;
  reviewerChecklist: string;
  spec: string;
  plan: string;
  sprintReview: string;
}

export function sprintPaths(cwd: string, sprintName: string): SprintPaths {
  const root = join(cwd, SPRINT_ROOT_REL, sprintName);
  return {
    root,
    state: join(root, "sprint-state.json"),
    sprintLog: join(root, "sprint.log"),
    sprintTasksLog: join(root, "sprint-tasks.log"),
    logsDir: join(root, "logs"),
    planningSummary: join(root, "planning-summary.md"),
    userStories: join(root, "user-stories.md"),
    architecture: join(root, "architecture.md"),
    reviewerChecklist: join(root, "reviewer-checklist.md"),
    spec: join(root, "spec.md"),
    plan: join(root, "plan.md"),
    sprintReview: join(root, "sprint-review.md"),
  };
}

export function ensureSprintDirs(paths: SprintPaths): void {
  mkdirSync(paths.logsDir, { recursive: true });
}

export function taskLogPath(paths: SprintPaths, taskId: string, agent: string, attempt: number): string {
  const n = String(attempt).padStart(2, "0");
  return join(paths.logsDir, `${taskId}-${agent}-${n}.log`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npm test`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/paths.ts mcp/src/__tests__/paths.test.ts
git commit -m "Add sprint directory path layout"
```

---

### Task 3: `lib/state.ts` — sprint state machine

**Files:**
- Create: `lib/state.ts`
- Create: `mcp/src/__tests__/state.test.ts`

**Interfaces:**
- Consumes: none (pure, filesystem-only via `node:fs`)
- Produces:
  - `type Gate = "builder" | "tester" | "reviewer" | "security" | "verify" | "commit" | "done"`
  - `type GateResult = "pending" | "pass" | "fail"`
  - `interface Strike { attempt, gate, reason, timestamp }`
  - `interface TaskState { id, title, story, files, gate, attempts, strikes, gates, startedAt?, completedAt?, commitSha? }`
  - `type Phase = "planning" | "planning-approved" | "development" | "final-review" | "closed"`
  - `interface SprintState { name, branch, phase, createdAt, caseNumber?, tasks, halted?, polishReturnPhase? }`
  - `GATE_SEQUENCE: Gate[]`
  - `nextGate(gate: Gate): Gate`
  - `loadState(paths: SprintPaths): SprintState | undefined`
  - `saveState(paths: SprintPaths, state: SprintState): void`
  - `findTask(state, taskId): TaskState`
  - `transition(task, target, result?): void`
  - `recordStrike(task, gate, reason): number`
  - `interface TaskSeedInput { id, title, story, files }`
  - `validateTaskSeed(tasks): void`
  - `seedTasks(state, inputs): number`
  - `appendPolishTask(state, input): void`
  - `maybeCompletePhase(state): { phaseFlipped?, restoredToFinalReview? }`
  - `readyToCommit(task): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// mcp/src/__tests__/state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sprintPaths, ensureSprintDirs } from "../../../lib/paths.js";
import {
  GATE_SEQUENCE,
  nextGate,
  loadState,
  saveState,
  findTask,
  transition,
  recordStrike,
  validateTaskSeed,
  seedTasks,
  appendPolishTask,
  maybeCompletePhase,
  readyToCommit,
  type SprintState,
} from "../../../lib/state.js";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "sprint-state-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function freshState(): SprintState {
  return {
    name: "fix-sorting",
    branch: "sprint/fix-sorting",
    phase: "planning",
    createdAt: new Date().toISOString(),
    tasks: [],
  };
}

describe("gate sequence", () => {
  it("follows builder -> tester -> reviewer -> security -> verify -> commit -> done", () => {
    expect(GATE_SEQUENCE).toEqual(["builder", "tester", "reviewer", "security", "verify", "commit", "done"]);
    expect(nextGate("builder")).toBe("tester");
    expect(nextGate("verify")).toBe("commit");
    expect(nextGate("commit")).toBe("done");
  });

  it("throws when asked for the gate after done", () => {
    expect(() => nextGate("done")).toThrow(/no next gate/);
  });
});

describe("saveState / loadState", () => {
  it("round-trips through disk and is undefined when no file exists", () => {
    const paths = sprintPaths(cwd, "fix-sorting");
    ensureSprintDirs(paths);
    expect(loadState(paths)).toBeUndefined();

    const state = freshState();
    saveState(paths, state);
    const loaded = loadState(paths);
    expect(loaded).toEqual(state);
  });
});

describe("seedTasks", () => {
  it("seeds tasks at the builder gate and flips phase to development", () => {
    const state = freshState();
    const count = seedTasks(state, [
      { id: "task-1", title: "Add sorting", story: "Story 1 AC 1", files: ["lib/foo.ex"] },
    ]);
    expect(count).toBe(1);
    expect(state.phase).toBe("development");
    expect(state.tasks[0]).toMatchObject({ id: "task-1", gate: "builder", attempts: 0, strikes: [] });
  });

  it("rejects duplicate ids via validateTaskSeed", () => {
    const dup = [
      { id: "task-1", title: "A", story: "S1", files: ["a.ex"] },
      { id: "task-1", title: "B", story: "S2", files: ["b.ex"] },
    ];
    expect(() => validateTaskSeed(dup)).toThrow(/duplicate task id/);
  });

  it("rejects a task with no declared files", () => {
    expect(() => validateTaskSeed([{ id: "task-1", title: "A", story: "S1", files: [] }])).toThrow(
      /declares no files/,
    );
  });
});

describe("transition", () => {
  it("advances along a legal edge and stamps completedAt on done", () => {
    const state = freshState();
    seedTasks(state, [{ id: "task-1", title: "A", story: "S1", files: ["a.ex"] }]);
    const task = findTask(state, "task-1");
    transition(task, "tester");
    expect(task.gate).toBe("tester");
    expect(task.gates.builder).toBe("pass");

    task.gate = "commit";
    transition(task, "done");
    expect(task.gate).toBe("done");
    expect(task.completedAt).toBeDefined();
  });

  it("refuses an illegal edge", () => {
    const state = freshState();
    seedTasks(state, [{ id: "task-1", title: "A", story: "S1", files: ["a.ex"] }]);
    const task = findTask(state, "task-1");
    expect(() => transition(task, "security")).toThrow(/illegal transition/);
  });

  it("allows restart-from-scratch (any gate -> builder)", () => {
    const state = freshState();
    seedTasks(state, [{ id: "task-1", title: "A", story: "S1", files: ["a.ex"] }]);
    const task = findTask(state, "task-1");
    task.gate = "security";
    transition(task, "builder");
    expect(task.gate).toBe("builder");
  });
});

describe("recordStrike", () => {
  it("increments attempts, records the strike, and resets gate to builder", () => {
    const state = freshState();
    seedTasks(state, [{ id: "task-1", title: "A", story: "S1", files: ["a.ex"] }]);
    const task = findTask(state, "task-1");
    task.gate = "tester";
    const n = recordStrike(task, "tester", "test failed");
    expect(n).toBe(1);
    expect(task.gate).toBe("builder");
    expect(task.gates.tester).toBe("fail");
    expect(task.strikes).toHaveLength(1);
    expect(task.strikes[0]).toMatchObject({ attempt: 1, gate: "tester", reason: "test failed" });
  });
});

describe("appendPolishTask", () => {
  it("flips final-review -> development and remembers polishReturnPhase", () => {
    const state = freshState();
    state.phase = "final-review";
    appendPolishTask(state, { id: "polish-1", title: "Fix typo", story: "Architect finding", files: ["a.ex"] });
    expect(state.phase).toBe("development");
    expect(state.polishReturnPhase).toBe("final-review");
    expect(state.tasks).toHaveLength(1);
  });

  it("refuses outside final-review/development", () => {
    const state = freshState();
    state.phase = "planning";
    expect(() =>
      appendPolishTask(state, { id: "polish-1", title: "T", story: "S", files: ["a.ex"] }),
    ).toThrow(/expected final-review/);
  });
});

describe("maybeCompletePhase", () => {
  it("flips development -> final-review once every task is done", () => {
    const state = freshState();
    seedTasks(state, [{ id: "task-1", title: "A", story: "S1", files: ["a.ex"] }]);
    findTask(state, "task-1").gate = "done";
    const result = maybeCompletePhase(state);
    expect(result.phaseFlipped).toBe(true);
    expect(state.phase).toBe("final-review");
  });

  it("restores final-review after a polish run completes", () => {
    const state = freshState();
    state.phase = "final-review";
    appendPolishTask(state, { id: "polish-1", title: "T", story: "S", files: ["a.ex"] });
    findTask(state, "polish-1").gate = "done";
    const result = maybeCompletePhase(state);
    expect(result.restoredToFinalReview).toBe(true);
    expect(state.phase).toBe("final-review");
    expect(state.polishReturnPhase).toBeUndefined();
  });
});

describe("readyToCommit", () => {
  it("requires gate=commit and every gate green", () => {
    const state = freshState();
    seedTasks(state, [{ id: "task-1", title: "A", story: "S1", files: ["a.ex"] }]);
    const task = findTask(state, "task-1");
    task.gate = "commit";
    task.gates = { tester: "pass", reviewer: "pass", security: "pass", verify: "pass" };
    expect(readyToCommit(task)).toBe(true);

    task.gates.security = "fail";
    expect(readyToCommit(task)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL — `lib/state.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// lib/state.ts
import { readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import type { SprintPaths } from "./paths.js";

export type Gate = "builder" | "tester" | "reviewer" | "security" | "verify" | "commit" | "done";
export type GateResult = "pending" | "pass" | "fail";

export interface Strike {
  attempt: number;
  gate: Gate;
  reason: string;
  timestamp: string;
}

export interface TaskState {
  id: string;
  title: string;
  story: string;
  files: string[];
  gate: Gate;
  attempts: number;
  strikes: Strike[];
  gates: Partial<Record<Gate, GateResult>>;
  startedAt?: string;
  completedAt?: string;
  commitSha?: string;
}

export type Phase = "planning" | "planning-approved" | "development" | "final-review" | "closed";

export interface SprintState {
  name: string;
  branch: string;
  phase: Phase;
  createdAt: string;
  caseNumber?: string;
  tasks: TaskState[];
  halted?: { reason: string; at: string; source?: "strike-4" | "manual" };
  polishReturnPhase?: Phase;
}

export const GATE_SEQUENCE: Gate[] = ["builder", "tester", "reviewer", "security", "verify", "commit", "done"];

export function nextGate(gate: Gate): Gate {
  const i = GATE_SEQUENCE.indexOf(gate);
  if (i < 0 || i === GATE_SEQUENCE.length - 1) {
    throw new Error(`no next gate after ${gate}`);
  }
  return GATE_SEQUENCE[i + 1];
}

const LEGAL_EDGES: Record<Gate, Gate[]> = {
  builder: ["tester", "builder"],
  tester: ["reviewer", "builder"],
  reviewer: ["security", "builder"],
  security: ["verify", "builder"],
  verify: ["commit", "builder"],
  commit: ["done", "builder"],
  done: [],
};

export function loadState(paths: SprintPaths): SprintState | undefined {
  if (!existsSync(paths.state)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.state, "utf8"));
  } catch (err) {
    throw new Error(`Corrupt sprint-state.json at ${paths.state}. Repair or delete manually.`);
  }
  return raw as SprintState;
}

export function saveState(paths: SprintPaths, state: SprintState): void {
  const tmp = `${paths.state}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, paths.state);
}

export function findTask(state: SprintState, taskId: string): TaskState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  return task;
}

export function transition(task: TaskState, target: Gate, result: GateResult = "pass"): void {
  const legal = LEGAL_EDGES[task.gate];
  if (!legal.includes(target)) {
    throw new Error(`illegal transition ${task.gate} -> ${target} for ${task.id}`);
  }
  task.gates[task.gate] = result;
  task.gate = target;
  if (target === "done") task.completedAt = new Date().toISOString();
}

export function recordStrike(task: TaskState, gate: Gate, reason: string): number {
  task.attempts += 1;
  task.strikes.push({ attempt: task.attempts, gate, reason, timestamp: new Date().toISOString() });
  task.gates[gate] = "fail";
  task.gate = "builder";
  return task.attempts;
}

export interface TaskSeedInput {
  id: string;
  title: string;
  story: string;
  files: string[];
}

export function validateTaskSeed(tasks: TaskSeedInput[]): void {
  if (!tasks || tasks.length === 0) throw new Error("no tasks to seed");
  const ids = new Set<string>();
  for (const t of tasks) {
    if (!t.id) throw new Error("task missing id");
    if (ids.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    ids.add(t.id);
    if (!t.title) throw new Error(`task ${t.id} missing title`);
    if (!t.story) throw new Error(`task ${t.id} missing story reference`);
    if (!Array.isArray(t.files) || t.files.length === 0) {
      throw new Error(`task ${t.id} declares no files`);
    }
  }
}

export function seedTasks(state: SprintState, inputs: TaskSeedInput[]): number {
  validateTaskSeed(inputs);
  state.tasks = inputs.map((t) => ({
    id: t.id,
    title: t.title,
    story: t.story,
    files: t.files,
    gate: "builder" as Gate,
    attempts: 0,
    strikes: [],
    gates: {},
  }));
  state.phase = "development";
  return state.tasks.length;
}

export function appendPolishTask(state: SprintState, input: TaskSeedInput): void {
  if (state.phase !== "final-review" && state.phase !== "development") {
    throw new Error(
      `cannot append polish task: phase is ${state.phase}, expected final-review (or development during an existing polish run)`,
    );
  }
  if (state.tasks.some((t) => t.id === input.id)) {
    throw new Error(`duplicate task id: ${input.id}`);
  }
  if (!input.title) throw new Error(`task ${input.id} missing title`);
  if (!input.story) throw new Error(`task ${input.id} missing story reference`);
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new Error(`task ${input.id} declares no files`);
  }
  state.tasks.push({
    id: input.id,
    title: input.title,
    story: input.story,
    files: input.files,
    gate: "builder",
    attempts: 0,
    strikes: [],
    gates: {},
  });
  if (state.phase === "final-review") {
    state.polishReturnPhase = "final-review";
    state.phase = "development";
  }
}

export function maybeCompletePhase(state: SprintState): { phaseFlipped?: boolean; restoredToFinalReview?: boolean } {
  if (state.phase !== "development") return {};
  const pending = state.tasks.some((t) => t.gate !== "done");
  if (pending) return {};

  if (state.polishReturnPhase === "final-review") {
    state.phase = "final-review";
    state.polishReturnPhase = undefined;
    return { restoredToFinalReview: true };
  }
  state.phase = "final-review";
  return { phaseFlipped: true };
}

export function readyToCommit(task: TaskState): boolean {
  return (
    task.gate === "commit" &&
    task.gates.builder !== "fail" &&
    task.gates.tester === "pass" &&
    task.gates.reviewer === "pass" &&
    task.gates.security === "pass" &&
    task.gates.verify === "pass"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npm test`
Expected: PASS (all `state.test.ts` cases)

- [ ] **Step 5: Commit**

```bash
git add lib/state.ts mcp/src/__tests__/state.test.ts
git commit -m "Add sprint state machine (gates, strikes, phase transitions)"
```

---

### Task 4: `lib/ownership.ts` and `lib/git-guard.ts` — guard predicates

**Files:**
- Create: `lib/ownership.ts`
- Create: `lib/git-guard.ts`
- Create: `mcp/src/__tests__/ownership.test.ts`
- Create: `mcp/src/__tests__/git-guard.test.ts`

**Interfaces:**
- Produces:
  - `pathOwnedBy(path: string, entry: string): boolean`
  - `BLOCKED_GIT_SUBCOMMANDS: string[]`
  - `extractGitSubcommand(command: string): string | undefined`

- [ ] **Step 1: Write the failing tests**

```ts
// mcp/src/__tests__/ownership.test.ts
import { describe, it, expect } from "vitest";
import { pathOwnedBy } from "../../../lib/ownership.js";

describe("pathOwnedBy", () => {
  it("matches an exact file", () => {
    expect(pathOwnedBy("lib/foo.ex", "lib/foo.ex")).toBe(true);
    expect(pathOwnedBy("lib/bar.ex", "lib/foo.ex")).toBe(false);
  });

  it("matches a directory entry without trailing slash", () => {
    expect(pathOwnedBy("lib/foo/bar.ex", "lib/foo")).toBe(true);
  });

  it("matches a directory-prefix entry with trailing slash", () => {
    expect(pathOwnedBy("priv/repo/migrations/20260101_x.exs", "priv/repo/migrations/")).toBe(true);
  });

  it("matches the reverse case: a dirty parent directory covering a declared file", () => {
    expect(pathOwnedBy("lib/foo/adapters/", "lib/foo/adapters/impl.ex")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(pathOwnedBy("lib/other/bar.ex", "lib/foo/")).toBe(false);
  });
});
```

```ts
// mcp/src/__tests__/git-guard.test.ts
import { describe, it, expect } from "vitest";
import { extractGitSubcommand, BLOCKED_GIT_SUBCOMMANDS } from "../../../lib/git-guard.js";

describe("extractGitSubcommand", () => {
  it("finds the subcommand after global flags", () => {
    expect(extractGitSubcommand("git commit -m foo")).toBe("commit");
    expect(extractGitSubcommand("git -c a=b commit -m foo")).toBe("commit");
    expect(extractGitSubcommand("git --git-dir=/x status")).toBe("status");
  });

  it("skips a value-taking global flag's argument", () => {
    expect(extractGitSubcommand("git -C /some/path commit")).toBe("commit");
  });

  it("returns undefined for non-git commands", () => {
    expect(extractGitSubcommand("ls -la")).toBeUndefined();
  });

  it("lists the mutating subcommands that are blocked", () => {
    expect(BLOCKED_GIT_SUBCOMMANDS).toEqual(["commit", "merge", "push", "reset", "rebase", "cherry-pick"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL — `lib/ownership.ts` and `lib/git-guard.ts` do not exist.

- [ ] **Step 3: Write the implementations**

```ts
// lib/ownership.ts
export function pathOwnedBy(path: string, entry: string): boolean {
  if (path === entry) return true;
  const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
  if (path.startsWith(entryPrefix)) return true;
  const pathPrefix = path.endsWith("/") ? path : `${path}/`;
  if (entry.startsWith(pathPrefix)) return true;
  return false;
}
```

```ts
// lib/git-guard.ts
export const BLOCKED_GIT_SUBCOMMANDS = ["commit", "merge", "push", "reset", "rebase", "cherry-pick"];

const GIT_VALUE_FLAGS = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

export function extractGitSubcommand(command: string): string | undefined {
  const m = command.match(/\bgit\s+(.*)/s);
  if (!m) return undefined;
  const tokens = m[1].split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "") continue;
    if (GIT_VALUE_FLAGS.has(tok)) {
      i++;
      continue;
    }
    if (tok.startsWith("-")) continue;
    return tok;
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ownership.ts lib/git-guard.ts mcp/src/__tests__/ownership.test.ts mcp/src/__tests__/git-guard.test.ts
git commit -m "Add file-ownership and git-subcommand guard predicates"
```

---

### Task 5: `mcp/src/git.ts` — git helpers via child_process

**Files:**
- Create: `mcp/src/git.ts`

**Interfaces:**
- Consumes: nothing from `lib/` (deliberately duplicates the small `ownedBy` predicate rather than importing `lib/ownership.ts`, matching the original's stated one-way-dependency rule between `git.ts` and `guards.ts`)
- Produces:
  - `async function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }>`
  - `currentBranch(): Promise<string>`
  - `branchExists(branch: string): Promise<boolean>`
  - `startSprintBranch(branch: string): Promise<void>`
  - `interface CommitInput { sprintName, sprintRootRel, taskId, title, storyRef, gateSummary, files, caseNumber? }`
  - `workingTreeStatus(): Promise<Array<{ status: string; path: string }>>`
  - `commitPlanning(input: { sprintName: string; goal: string }): Promise<string | null>`
  - `commitTask(input: CommitInput): Promise<string>`
  - `commitLogsConsolidation(input: { sprintName; logsDirRel; consolidatedLogRel }): Promise<string | null>`
  - `mergeSprint(sprintBranch: string): Promise<string>`
  - `pushBranch(branch: string): Promise<void>`
  - `createPullRequest(opts: { title; body; base; branch }): Promise<string>`

This is a direct, unauthenticated (no `AUTHORIZED` flag — see Global Constraints and the
design spec's Open Risk resolution) port of the original `git.ts`, using
`node:child_process.execFile` in place of `pi.exec`.

- [ ] **Step 1: Write the implementation**

```ts
// mcp/src/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { maxBuffer: 20 * 1024 * 1024 });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? String(err), code: e.code ?? 1 };
  }
}

export async function currentBranch(): Promise<string> {
  const { stdout, code } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (code !== 0) throw new Error("not a git repo or HEAD detached");
  return stdout.trim();
}

export async function branchExists(branch: string): Promise<boolean> {
  const { code } = await run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  return code === 0;
}

export async function startSprintBranch(branch: string): Promise<void> {
  const head = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head.stdout.trim() === branch) return;

  if (await branchExists(branch)) {
    const { code, stderr } = await run("git", ["checkout", branch]);
    if (code !== 0) throw new Error(`git checkout ${branch} failed: ${stderr}`);
    return;
  }
  const { code, stderr } = await run("git", ["checkout", "-b", branch]);
  if (code !== 0) throw new Error(`git checkout -b ${branch} failed: ${stderr}`);
}

export interface CommitInput {
  sprintName: string;
  sprintRootRel: string;
  taskId: string;
  title: string;
  storyRef: string;
  gateSummary: string;
  files: string[];
  caseNumber?: string;
}

export async function workingTreeStatus(): Promise<Array<{ status: string; path: string }>> {
  const { stdout, code } = await run("git", ["status", "--porcelain"]);
  if (code !== 0) throw new Error("git status --porcelain failed");
  return stdout
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => ({ status: l.slice(0, 2), path: l.slice(3) }));
}

export async function commitPlanning(input: { sprintName: string; goal: string }): Promise<string | null> {
  const add = await run("git", ["add", "-A"]);
  if (add.code !== 0) throw new Error(`git add -A failed: ${add.stderr}`);

  const diff = await run("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return null;

  const msg = `[sprint/${input.sprintName}] planning: approved\n\nGoal: ${input.goal}\nAgents: PO, Architect, Tester, PM\n`;
  const commit = await run("git", ["commit", "-m", msg]);
  if (commit.code !== 0) throw new Error(`git commit (planning) failed: ${commit.stderr}`);

  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

function ownedBy(path: string, entry: string): boolean {
  if (path === entry) return true;
  const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
  if (path.startsWith(entryPrefix)) return true;
  const pathPrefix = path.endsWith("/") ? path : `${path}/`;
  if (entry.startsWith(pathPrefix)) return true;
  return false;
}

export async function commitTask(input: CommitInput): Promise<string> {
  const dirty = await workingTreeStatus();
  const unowned = dirty.filter(({ path }) => {
    if (path.startsWith(`${input.sprintRootRel}/`)) return false;
    return !input.files.some((f) => ownedBy(path, f));
  });

  if (unowned.length > 0) {
    const summary = unowned.map((d) => `  ${d.status} ${d.path}`).join("\n");
    throw new Error(
      `commit_task refused: working tree has changes outside task ${input.taskId}'s declared ownership:\n${summary}\n\n` +
        "Either amend this task's file ownership to cover them, route them through a polish-{n} task, " +
        "or revert the changes before retrying.",
    );
  }

  const dirtyPaths = dirty.filter(({ path }) => !path.startsWith(`${input.sprintRootRel}/`)).map(({ path }) => path);
  if (dirtyPaths.length > 0) {
    const addDeclared = await run("git", ["add", "--", ...dirtyPaths]);
    if (addDeclared.code !== 0) throw new Error(`git add (task files) failed: ${addDeclared.stderr}`);
  }

  const addArtifacts = await run("git", ["add", "--", input.sprintRootRel]);
  if (addArtifacts.code !== 0) throw new Error(`git add (sprint artifacts) failed: ${addArtifacts.stderr}`);

  const msg =
    `[sprint/${input.sprintName}] ${input.taskId}: ${input.title}\n\n` +
    `${input.storyRef}\n${input.gateSummary}\n` +
    (input.caseNumber ? `\n${input.caseNumber}\n` : "");

  const commit = await run("git", ["commit", "-m", msg]);
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`);

  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function commitLogsConsolidation(input: {
  sprintName: string;
  logsDirRel: string;
  consolidatedLogRel: string;
}): Promise<string | null> {
  const lsLogs = await run("git", ["ls-files", "--", input.logsDirRel]);
  if (lsLogs.stdout.trim().length > 0) {
    const addLogs = await run("git", ["add", "-A", "--", input.logsDirRel]);
    if (addLogs.code !== 0) throw new Error(`git add (log deletions) failed: ${addLogs.stderr}`);
  }

  const addConsolidated = await run("git", ["add", "--", input.consolidatedLogRel]);
  if (addConsolidated.code !== 0) throw new Error(`git add (sprint-tasks.log) failed: ${addConsolidated.stderr}`);

  const diff = await run("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return null;

  const msg = `[sprint/${input.sprintName}] consolidate task logs → sprint-tasks.log\n`;
  const commit = await run("git", ["commit", "-m", msg]);
  if (commit.code !== 0) throw new Error(`git commit (consolidate logs) failed: ${commit.stderr}`);

  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function mergeSprint(sprintBranch: string): Promise<string> {
  const dirty = await run("git", ["status", "--porcelain"]);
  if (dirty.stdout.trim().length > 0) throw new Error("working tree dirty — cannot merge");
  const co = await run("git", ["checkout", "main"]);
  if (co.code !== 0) throw new Error(`git checkout main failed: ${co.stderr}`);
  const merge = await run("git", ["merge", "--no-ff", sprintBranch, "-m", `Merge ${sprintBranch}`]);
  if (merge.code !== 0) throw new Error(`git merge failed: ${merge.stderr}`);
  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function pushBranch(branch: string): Promise<void> {
  const push = await run("git", ["push", "-u", "origin", branch]);
  if (push.code !== 0) throw new Error(`git push -u origin ${branch} failed: ${push.stderr}`);
}

export async function createPullRequest(opts: {
  title: string;
  body: string;
  base: string;
  branch: string;
}): Promise<string> {
  const result = await run("gh", ["pr", "create", "--title", opts.title, "--body", opts.body, "--base", opts.base, "--head", opts.branch]);
  if (result.code !== 0) throw new Error(`gh pr create failed: ${result.stderr}`);
  return result.stdout.trim();
}
```

- [ ] **Step 2: Type-check**

Run: `cd mcp && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add mcp/src/git.ts
git commit -m "Add git helpers (child_process-based, no cross-process auth flag needed)"
```

---

### Task 6: `mcp/src/verify.ts` — the verification gate

**Files:**
- Create: `mcp/src/verify.ts`

**Interfaces:**
- Produces:
  - `interface VerifyStep { name, cmd, args, timeoutMs? }`
  - `interface VerifyStepResult { name, exitCode, stdoutTail, stderrTail }`
  - `interface VerifyResult { ok, steps, failedStep? }`
  - `DEFAULT_STEPS: VerifyStep[]` — single step: `mix precommit`
  - `runVerify(steps?: VerifyStep[]): Promise<VerifyResult>`

- [ ] **Step 1: Write the implementation**

```ts
// mcp/src/verify.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface VerifyStep {
  name: string;
  cmd: string;
  args: string[];
  timeoutMs?: number;
}

export interface VerifyStepResult {
  name: string;
  exitCode: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface VerifyResult {
  ok: boolean;
  steps: VerifyStepResult[];
  failedStep?: string;
}

export const DEFAULT_STEPS: VerifyStep[] = [
  { name: "precommit", cmd: "mix", args: ["precommit"], timeoutMs: 30 * 60 * 1000 },
];

function tail(s: string, lines = 40): string {
  const arr = s.split("\n");
  return arr.slice(Math.max(0, arr.length - lines)).join("\n");
}

export async function runVerify(steps: VerifyStep[] = DEFAULT_STEPS): Promise<VerifyResult> {
  const results: VerifyStepResult[] = [];
  for (const step of steps) {
    let exitCode = 0;
    let stdout = "";
    let stderr = "";
    try {
      const res = await execFileAsync(step.cmd, step.args, {
        timeout: step.timeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 50 * 1024 * 1024,
      });
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? String(err);
      exitCode = e.code ?? 1;
    }
    const result: VerifyStepResult = { name: step.name, exitCode, stdoutTail: tail(stdout), stderrTail: tail(stderr) };
    results.push(result);
    if (result.exitCode !== 0) {
      return { ok: false, steps: results, failedStep: step.name };
    }
  }
  return { ok: true, steps: results };
}
```

- [ ] **Step 2: Type-check**

Run: `cd mcp && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add mcp/src/verify.ts
git commit -m "Add verify.ts running mix precommit as the single verification gate"
```

---

### Task 7: `mcp/src/mix-exs-patcher.ts` — TS port of `MixExsPatcher`

**Files:**
- Create: `mcp/src/mix-exs-patcher.ts`
- Create: `mcp/src/__tests__/mix-exs-patcher.test.ts`

**Interfaces:**
- Produces:
  - `PRECOMMIT_STEPS: string[]`
  - `patch(content: string): string`
  - `addDialyzerConfig(content: string): string`
  - `addToolingDeps(content: string): string`
  - `updatePrecommitAlias(content: string): string`
  - `manualInstructions(): string`

Port the exact fixture and assertions from
`/Users/jbosse/Projects/mix_pi_dev_setup/test/pi_dev_setup/mix_exs_patcher_test.exs` to
vitest — same `mix.exs` shape, same anchors, same idempotency guarantee.

- [ ] **Step 1: Write the failing tests**

```ts
// mcp/src/__tests__/mix-exs-patcher.test.ts
import { describe, it, expect } from "vitest";
import { patch, addDialyzerConfig, PRECOMMIT_STEPS } from "../mix-exs-patcher.js";

const PHOENIX_1_8 = `defmodule MyShop.MixProject do
  use Mix.Project

  def project do
    [
      app: :my_shop,
      version: "0.1.0",
      elixir: "~> 1.15",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      listeners: [Phoenix.CodeReloader]
    ]
  end

  defp deps do
    [
      {:phoenix, "~> 1.8.0"},
      {:phoenix_ecto, "~> 4.5"},
      {:ecto_sql, "~> 3.13"},
      {:bandit, "~> 1.5"}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      precommit: ["compile --warning-as-errors", "deps.unlock --unused", "format", "test"]
    ]
  end
end
`;

describe("patch", () => {
  it("adds dialyzer config after the listeners entry", () => {
    const patched = patch(PHOENIX_1_8);
    expect(patched).toContain("listeners: [Phoenix.CodeReloader],");
    expect(patched).toContain('plt_file: {:no_warn, "priv/plts/dialyzer.plt"}');
    expect(patched).toContain("flags: [:error_handling, :unknown]");
  });

  it("falls back to the deps: deps() anchor when listeners is absent (Phoenix 1.7 shape)", () => {
    const withoutListeners = PHOENIX_1_8.replace(",\n      listeners: [Phoenix.CodeReloader]", "");
    const patched = patch(withoutListeners);
    expect(patched).toContain("dialyzer: [");
    expect(patched).toContain("deps: deps(),\n");
  });

  it("adds the tooling deps after bandit", () => {
    const patched = patch(PHOENIX_1_8);
    expect(patched).toContain('{:bandit, "~> 1.5"},');
    expect(patched).toContain('{:credo, "~> 1.7", only: [:dev, :test], runtime: false}');
    expect(patched).toContain('{:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false}');
    expect(patched).toContain('{:sobelow, "~> 0.13", only: [:dev, :test], runtime: false}');
    expect(patched).toContain('{:mox, "~> 1.1", only: :test}');
  });

  it("expands the precommit alias to the full pipeline", () => {
    const patched = patch(PHOENIX_1_8);
    for (const step of PRECOMMIT_STEPS) {
      expect(patched).toContain(JSON.stringify(step));
    }
    expect(patched).not.toContain("deps.unlock --unused");
  });

  it("is idempotent — patching twice equals patching once", () => {
    const once = patch(PHOENIX_1_8);
    expect(patch(once)).toBe(once);
  });

  it("returns content unchanged when no anchors match", () => {
    const unrecognized = `defmodule Odd.MixProject do\n  use Mix.Project\n  def project, do: [app: :odd, version: "0.1.0"]\nend\n`;
    expect(patch(unrecognized)).toBe(unrecognized);
  });

  it("leaves an existing dialyzer config alone", () => {
    const withDialyzer = PHOENIX_1_8.replace("deps: deps(),", "deps: deps(),\n      dialyzer: [flags: []],");
    expect(addDialyzerConfig(withDialyzer)).toBe(withDialyzer);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL — `mcp/src/mix-exs-patcher.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// mcp/src/mix-exs-patcher.ts
const DIALYZER_CONFIG = `      dialyzer: [
        plt_add_apps: [:ex_unit, :mix],
        plt_file: {:no_warn, "priv/plts/dialyzer.plt"},
        plt_core_path: "priv/plts",
        ignore_warnings: ".dialyzer_ignore.exs",
        flags: [:error_handling, :unknown]
      ],`;

const TOOLING_DEPS = `
      # --- Tooling / verification gate ---
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},
      {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},
      {:mox, "~> 1.1", only: :test}`;

export const PRECOMMIT_STEPS = [
  "deps.get --check-locked",
  "compile --warnings-as-errors",
  "format --check-formatted",
  "credo --strict",
  "sobelow --config",
  "ecto.create --quiet",
  "ecto.migrate --quiet",
  "dialyzer",
  "test --warnings-as-errors",
  "assets.build",
];

export function patch(content: string): string {
  return updatePrecommitAlias(addToolingDeps(addDialyzerConfig(content)));
}

export function addDialyzerConfig(content: string): string {
  if (content.includes("dialyzer:")) return content;

  if (content.includes("listeners: [Phoenix.CodeReloader]")) {
    return content.replace(
      "listeners: [Phoenix.CodeReloader]",
      `listeners: [Phoenix.CodeReloader],\n${DIALYZER_CONFIG}`,
    );
  }
  if (content.includes("deps: deps(),")) {
    return content.replace("deps: deps(),", `deps: deps(),\n${DIALYZER_CONFIG}`);
  }
  if (content.includes("deps: deps()")) {
    return content.replace("deps: deps()", `deps: deps(),\n${DIALYZER_CONFIG.replace(/,$/, "")}`);
  }
  return content;
}

export function addToolingDeps(content: string): string {
  if (content.includes(":credo")) return content;
  const banditPattern = /(\{:bandit,[^}]+\})(\s*\n\s*\])/;
  if (banditPattern.test(content)) {
    return content.replace(banditPattern, (_m, g1, g2) => `${g1},${TOOLING_DEPS}\n${g2}`);
  }
  return content;
}

export function updatePrecommitAlias(content: string): string {
  if (content.includes("credo --strict")) return content;
  const precommitPattern = /([ \t]*)precommit:\s*\[.*?\]/s;
  if (!precommitPattern.test(content)) return content;
  return content.replace(precommitPattern, (_m, indent: string) => {
    const items = PRECOMMIT_STEPS.map((s) => `${indent}  ${JSON.stringify(s)}`).join(",\n");
    return `${indent}precommit: [\n${items}\n${indent}]`;
  });
}

export function manualInstructions(): string {
  return `
── Manual mix.exs changes needed ────────────────────────────────────────

1. Add to the project/0 keyword list:

${DIALYZER_CONFIG}

2. Add to defp deps do ... end:
${TOOLING_DEPS}

3. Replace the precommit: alias in defp aliases do ... end:

    precommit: [
${PRECOMMIT_STEPS.map((s) => `      ${JSON.stringify(s)}`).join(",\n")}
    ]

─────────────────────────────────────────────────────────────────────────
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npm test`
Expected: PASS (all `mix-exs-patcher.test.ts` cases)

- [ ] **Step 5: Commit**

```bash
git add mcp/src/mix-exs-patcher.ts mcp/src/__tests__/mix-exs-patcher.test.ts
git commit -m "Add TypeScript port of MixExsPatcher"
```

---

### Task 8: Bundle setup templates

**Files:**
- Create: `mcp/templates/credo.exs` (copy from `mix_pi_dev_setup/priv/templates/credo.exs`)
- Create: `mcp/templates/dialyzer_ignore.exs` (copy from `mix_pi_dev_setup/priv/templates/dialyzer_ignore.exs`)
- Create: `mcp/templates/sobelow-conf` (copy from `mix_pi_dev_setup/priv/templates/sobelow-conf`)
- Create: `mcp/templates/SPEC.md` (copy from `mix_pi_dev_setup/priv/templates/SPEC.md`)
- Create: `mcp/templates/spawn-agent` (adapted from `mix_pi_dev_setup/spawn-agent`)
- Create: `mcp/templates/remove-agent` (copy from `mix_pi_dev_setup/remove-agent`)
- Create: `mcp/templates/docs/ORCHESTRATION.md`, `architecture.md`, `glossary.md`, `project_memory.md`, `styleguide.md` (adapted from `mix_pi_dev_setup/priv/templates/docs/*`)

**Interfaces:**
- Produces: the template tree `setup.ts` (Task 9) reads and renders.

- [ ] **Step 1: Copy the unchanged config templates verbatim**

Run:
```bash
cp /Users/jbosse/Projects/mix_pi_dev_setup/priv/templates/credo.exs mcp/templates/credo.exs
cp /Users/jbosse/Projects/mix_pi_dev_setup/priv/templates/dialyzer_ignore.exs mcp/templates/dialyzer_ignore.exs
cp /Users/jbosse/Projects/mix_pi_dev_setup/priv/templates/sobelow-conf mcp/templates/sobelow-conf
cp /Users/jbosse/Projects/mix_pi_dev_setup/priv/templates/SPEC.md mcp/templates/SPEC.md
cp /Users/jbosse/Projects/mix_pi_dev_setup/remove-agent mcp/templates/remove-agent
```
These four are tool-agnostic (Elixir static-analysis config and a generic product-spec
scaffold) — no Pi-specific content to change. `remove-agent` is pure git-worktree/DB/S3
cleanup with no Pi references at all.

- [ ] **Step 2: Adapt `spawn-agent`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/spawn-agent`, copy it to
`mcp/templates/spawn-agent`, and apply exactly these two changes (everything else —
worktree creation, `.env.local` merging, DB/bucket/port derivation, `start.sh`
generation — is unchanged):

1. Replace the `PI_CMD` usage:
```bash
# before
if [ -z "$PI_CMD" ]; then
  echo -e "${RED}Error: PI_CMD is not set in .env.local${NC}"
  echo "Add a line like:"
  echo "  export PI_CMD=\"pi\""
  echo "or for Bedrock:"
  echo "  export PI_CMD=\"AWS_PROFILE=my-profile pi --provider amazon-bedrock --model <arn>\""
  exit 1
fi

eval "$PI_CMD"
```
```bash
# after
if [ -z "$CLAUDE_CMD" ]; then
  echo -e "${RED}Error: CLAUDE_CMD is not set in .env.local${NC}"
  echo "Add a line like:"
  echo "  export CLAUDE_CMD=\"claude\""
  exit 1
fi

eval "$CLAUDE_CMD"
```

2. Replace the final launch banner text `"🤖 Launching Pi..."` with `"🤖 Launching
   Claude Code..."`.

- [ ] **Step 3: Port `docs/ORCHESTRATION.md`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/docs/ORCHESTRATION.md` (the live copy,
already rendered from the template with the same content), copy it to
`mcp/templates/docs/ORCHESTRATION.md`, and apply this exact find/replace table (apply
every row; the surrounding prose, tables, and process description are otherwise
unchanged):

| Find | Replace |
|---|---|
| `pi-subagents` | `Claude Code subagents (the Task tool)` |
| `pi-coding-agent` | `Claude Code` |
| `a new Pi process with its own context window` | `a fresh Claude Code subagent with its own context window` |
| `/skill:orchestrator` | `/orchestrator` |
| `/.pi/skills/{name}/SKILL.md` | `the plugin's skills/{name}/SKILL.md` |
| `/.pi/agents/{name}.md` | `the plugin's agents/{name}.md` |
| `subagent(product-owner, mode 1)` | `Task tool (subagent_type: "product-owner", mode 1)` (apply this pattern to every `subagent(...)` occurrence in the doc — same argument shape, different call syntax) |
| `subagent({ chain: "task-gates", task: taskId })` | `Task tool, four calls in sequence: subagent_type "builder", then "tester", then "reviewer", then "security" — each reads the task's plan.md entry and the prior step's log itself` |
| `/.pi/chains/task-gates.chain.md` | (delete the sentence referencing this file — the chain is now inlined directly in the orchestrator skill, there is no separate chain file) |
| `mix pi_dev_setup` and `mix pi_dev_update` | `the plugin's setup_project MCP tool` |

- [ ] **Step 4: Port the remaining docs templates**

Read each of `/Users/jbosse/Projects/mix_pi_dev_setup/docs/architecture.md`,
`glossary.md`, `project_memory.md`, `styleguide.md`. Copy each to the matching path
under `mcp/templates/docs/`, applying the same find/replace table from Step 3 wherever
those terms appear (most of these four are generic project-documentation scaffolding
with few or no Pi-specific references — apply the table, and if a file has zero matches,
copy it unchanged).

- [ ] **Step 5: Verify no Pi-specific terms remain**

Run: `grep -rn 'pi-subagents\|/skill:\|\.pi/\|subagent(' mcp/templates/`
Expected: no matches (empty output). Fix any stragglers the find/replace table missed.

- [ ] **Step 6: Commit**

```bash
git add mcp/templates
git commit -m "Bundle setup templates (docs, SPEC.md, static-analysis config, worktree scripts)"
```

---

### Task 9: `mcp/src/setup.ts` — `setup_project` logic

**Files:**
- Create: `mcp/src/setup.ts`
- Create: `mcp/src/__tests__/setup.test.ts`

**Interfaces:**
- Consumes: `mcp/src/mix-exs-patcher.ts`'s `patch` (Task 7); reads files from `mcp/templates/` (Task 8)
- Produces:
  - `interface Substitution { from: string; to: string }`
  - `substitutions(appName: string, opts?: { date?: string }): Substitution[]`
  - `applySubstitutions(content: string, subs: Substitution[]): string`
  - `interface FileMapping { templateRel: string; dest: string }`
  - `fileMappings(templateDir: string): FileMapping[]`
  - `detectAppName(mixExsContent: string): string`
  - `interface SetupResult { created: string[]; skipped: string[]; mixExsPatched: boolean; mixExsNote?: string; gitignorePatched: boolean }`
  - `runSetup(cwd: string, templateDir: string): SetupResult`

- [ ] **Step 1: Write the failing tests**

```ts
// mcp/src/__tests__/setup.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  substitutions,
  applySubstitutions,
  fileMappings,
  detectAppName,
  runSetup,
} from "../setup.js";

describe("substitutions", () => {
  it("renders all placeholder tokens", () => {
    const subs = substitutions("my_shop", { date: "2026-07-16" });
    const content = [
      "defmodule __APP_WEB_MODULE__.PageController do",
      "  alias __APP_MODULE__.Accounts",
      "end",
      "# lib/__APP_WEB_NAME__/ and lib/__APP_NAME__/",
      "# Recorded: __GENERATED_DATE__",
    ].join("\n");

    const rendered = applySubstitutions(content, subs);
    expect(rendered).toContain("MyShopWeb.PageController");
    expect(rendered).toContain("alias MyShop.Accounts");
    expect(rendered).toContain("lib/my_shop_web/ and lib/my_shop/");
    expect(rendered).toContain("Recorded: 2026-07-16");
    expect(rendered).not.toContain("__APP_");
    expect(rendered).not.toContain("__GENERATED_DATE__");
  });
});

describe("detectAppName", () => {
  it("extracts the app atom from mix.exs", () => {
    const mixExs = `defmodule MyShop.MixProject do\n  def project do\n    [\n      app: :my_shop,\n      version: "0.1.0"\n    ]\n  end\nend\n`;
    expect(detectAppName(mixExs)).toBe("my_shop");
  });

  it("throws when no app atom is found", () => {
    expect(() => detectAppName("defmodule X do end")).toThrow(/could not find/);
  });
});

let templateDir: string;
let cwd: string;

beforeEach(() => {
  templateDir = mkdtempSync(join(tmpdir(), "templates-"));
  cwd = mkdtempSync(join(tmpdir(), "project-"));
  mkdirSync(join(templateDir, "docs"), { recursive: true });
  writeFileSync(join(templateDir, "SPEC.md"), "# __APP_MODULE__ Spec\n");
  writeFileSync(join(templateDir, "docs", "architecture.md"), "# __APP_MODULE__ Architecture\n");
  writeFileSync(join(templateDir, "credo.exs"), "%{configs: []}\n");
  writeFileSync(join(templateDir, "spawn-agent"), "#!/bin/bash\necho hi\n");
});

afterEach(() => {
  rmSync(templateDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("fileMappings", () => {
  it("maps root dotfiles and nests docs/ unchanged", () => {
    const mappings = fileMappings(templateDir);
    const dest = new Map(mappings.map((m) => [m.templateRel, m.dest]));
    expect(dest.get("SPEC.md")).toBe("SPEC.md");
    expect(dest.get("docs/architecture.md")).toBe("docs/architecture.md");
    expect(dest.get("credo.exs")).toBe(".credo.exs");
    expect(dest.get("spawn-agent")).toBe("spawn-agent");
  });
});

describe("runSetup", () => {
  it("writes rendered templates, patches mix.exs, and never overwrites existing files", () => {
    writeFileSync(
      join(cwd, "mix.exs"),
      `defmodule MyShop.MixProject do\n  def project do\n    [\n      app: :my_shop,\n      deps: deps(),\n      listeners: [Phoenix.CodeReloader]\n    ]\n  end\n\n  defp deps do\n    [\n      {:bandit, "~> 1.5"}\n    ]\n  end\nend\n`,
    );
    // Pre-existing SPEC.md must survive untouched.
    writeFileSync(join(cwd, "SPEC.md"), "# already here\n");

    const result = runSetup(cwd, templateDir);

    expect(readFileSync(join(cwd, "SPEC.md"), "utf8")).toBe("# already here\n");
    expect(result.skipped).toContain("SPEC.md");

    expect(existsSync(join(cwd, "docs", "architecture.md"))).toBe(true);
    expect(readFileSync(join(cwd, "docs", "architecture.md"), "utf8")).toContain("MyShop Architecture");
    expect(result.created).toContain("docs/architecture.md");

    expect(result.mixExsPatched).toBe(true);
    const patchedMixExs = readFileSync(join(cwd, "mix.exs"), "utf8");
    expect(patchedMixExs).toContain("dialyzer: [");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npm test`
Expected: FAIL — `mcp/src/setup.ts` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// mcp/src/setup.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, chmodSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { globSync } from "node:fs";
import { patch as patchMixExs } from "./mix-exs-patcher.js";

const ROOT_DOTFILES: Record<string, string> = {
  "credo.exs": ".credo.exs",
  "dialyzer_ignore.exs": ".dialyzer_ignore.exs",
  "sobelow-conf": ".sobelow-conf",
};

const EXECUTABLES = ["spawn-agent", "remove-agent"];

export interface Substitution {
  from: string;
  to: string;
}

function camelize(appName: string): string {
  return appName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function substitutions(appName: string, opts: { date?: string } = {}): Substitution[] {
  const appModule = camelize(appName);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  return [
    { from: "__APP_WEB_MODULE__", to: `${appModule}Web` },
    { from: "__APP_MODULE__", to: appModule },
    { from: "__APP_WEB_NAME__", to: `${appName}_web` },
    { from: "__APP_NAME__", to: appName },
    { from: "__GENERATED_DATE__", to: date },
  ];
}

export function applySubstitutions(content: string, subs: Substitution[]): string {
  return subs.reduce((acc, { from, to }) => acc.split(from).join(to), content);
}

export interface FileMapping {
  templateRel: string;
  dest: string;
}

function destination(templateRel: string): string {
  if (templateRel in ROOT_DOTFILES) return ROOT_DOTFILES[templateRel];
  return templateRel;
}

export function fileMappings(templateDir: string): FileMapping[] {
  const entries = globSync("**/*", { cwd: templateDir, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(templateDir, join(e.parentPath, e.name)))
    .filter((rel) => !rel.endsWith(".DS_Store"))
    .sort();
  return entries.map((rel) => ({ templateRel: rel, dest: destination(rel) }));
}

export function detectAppName(mixExsContent: string): string {
  const m = mixExsContent.match(/app:\s*:([a-z0-9_]+)/);
  if (!m) throw new Error("could not find `app: :name` in mix.exs");
  return m[1];
}

const SPRINT_GITIGNORE_SENTINEL = "docs/sprint/*/logs/";
const SPRINT_GITIGNORE_BLOCK = `
# Sprint planning working docs (intermediate — not committed to the repo)
# Only sprint-review.md and qa-script.md are committed; everything else is ephemeral.
docs/sprint/*/logs/
docs/sprint/*/sprint-state.json
docs/sprint/*/sprint.log
docs/sprint/*/planning-summary.md
docs/sprint/*/architecture.md
docs/sprint/*/plan.md
docs/sprint/*/spec.md
docs/sprint/*/user-stories.md
docs/sprint/*/reviewer-checklist.md
`;

export interface SetupResult {
  created: string[];
  skipped: string[];
  mixExsPatched: boolean;
  mixExsNote?: string;
  gitignorePatched: boolean;
}

export function runSetup(cwd: string, templateDir: string): SetupResult {
  const mixExsPath = join(cwd, "mix.exs");
  if (!existsSync(mixExsPath)) {
    throw new Error("mix.exs not found — run setup from the root of a Phoenix project");
  }
  const appName = detectAppName(readFileSync(mixExsPath, "utf8"));
  const subs = substitutions(appName);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const { templateRel, dest } of fileMappings(templateDir)) {
    const destPath = join(cwd, dest);
    if (existsSync(destPath)) {
      skipped.push(dest);
      continue;
    }
    const rendered = applySubstitutions(readFileSync(join(templateDir, templateRel), "utf8"), subs);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, rendered);
    created.push(dest);
  }

  for (const exe of EXECUTABLES) {
    const p = join(cwd, exe);
    if (existsSync(p)) {
      const mode = statSync(p).mode;
      chmodSync(p, mode | 0o111);
    }
  }

  mkdirSync(join(cwd, "priv", "plts"), { recursive: true });
  const gitkeep = join(cwd, "priv", "plts", ".gitkeep");
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, "");
    created.push("priv/plts/.gitkeep");
  } else {
    skipped.push("priv/plts/.gitkeep");
  }

  const original = readFileSync(mixExsPath, "utf8");
  const patched = patchMixExs(original);
  const mixExsPatched = patched !== original;
  let mixExsNote: string | undefined;
  if (mixExsPatched) {
    writeFileSync(mixExsPath, patched);
  } else {
    mixExsNote = "could not auto-patch mix.exs (no matching anchors) — see manualInstructions()";
  }

  const gitignorePath = join(cwd, ".gitignore");
  const existingGitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  let gitignorePatched = false;
  if (!existingGitignore.includes(SPRINT_GITIGNORE_SENTINEL)) {
    const separator = existingGitignore.endsWith("\n") || existingGitignore === "" ? "" : "\n";
    writeFileSync(gitignorePath, existingGitignore + separator + "\n" + SPRINT_GITIGNORE_BLOCK);
    gitignorePatched = true;
  }

  return { created, skipped, mixExsPatched, mixExsNote, gitignorePatched };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npm test`
Expected: PASS (all `setup.test.ts` cases)

- [ ] **Step 5: Commit**

```bash
git add mcp/src/setup.ts mcp/src/__tests__/setup.test.ts
git commit -m "Add setup_project logic: template rendering, mix.exs patching, gitignore patching"
```

---

### Task 10: `mcp/src/index.ts` — wire up the MCP server

**Files:**
- Create: `mcp/src/index.ts`
- Create: `.mcp.json`

**Interfaces:**
- Consumes: everything from Tasks 2–9 (`lib/paths.ts`, `lib/state.ts`, `mcp/src/git.ts`,
  `mcp/src/verify.ts`, `mcp/src/setup.ts`)
- Produces: a running MCP server exposing tools `sprint_start`, `sprint_state_get`,
  `sprint_tasks_seed`, `gate_pass`, `task_log_append`, `strike_record`,
  `sprint_state_unhalt`, `verify_run`, `commit_task`, `consolidate_logs`, `sprint_merge`,
  `sprint_approve_planning`, `sprint_approve_close`, `sprint_halt`, `setup_project`.

This task has no unit test of its own (it is I/O wiring over already-tested logic); it
is verified by manually starting the server and listing its tools.

- [ ] **Step 1: Write `mcp/src/index.ts`**

```ts
// mcp/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { appendFileSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sprintPaths, ensureSprintDirs, taskLogPath, SPRINT_ROOT_REL, type SprintPaths } from "../../lib/paths.js";
import {
  loadState,
  saveState,
  findTask,
  transition,
  nextGate,
  recordStrike,
  seedTasks,
  appendPolishTask,
  maybeCompletePhase,
  readyToCommit,
  type SprintState,
  type Gate,
  type TaskState,
} from "../../lib/state.js";
import {
  currentBranch,
  startSprintBranch,
  commitPlanning,
  commitTask,
  commitLogsConsolidation,
  mergeSprint,
  pushBranch,
  createPullRequest,
} from "./git.js";
import { DEFAULT_STEPS, runVerify } from "./verify.js";
import { runSetup } from "./setup.js";

const CWD = process.cwd();
let ACTIVE_SPRINT: string | undefined;

function requireActive(): { state: SprintState; paths: SprintPaths } {
  if (!ACTIVE_SPRINT) throw new Error("no active sprint — call sprint_start or /sprint:resume first");
  const paths = sprintPaths(CWD, ACTIVE_SPRINT);
  const state = loadState(paths);
  if (!state) throw new Error(`sprint ${ACTIVE_SPRINT} has no state file at ${paths.state}`);
  return { state, paths };
}

function appendSprintLog(paths: SprintPaths, line: string): void {
  appendFileSync(paths.sprintLog, `[${new Date().toISOString()}] ${line}\n`);
}

function applyStrike(state: SprintState, paths: SprintPaths, task: TaskState, gate: Gate, reason: string) {
  const strikes = recordStrike(task, gate, reason);
  let halted = false;
  if (strikes >= 4) {
    state.halted = { reason: `task ${task.id} reached strike 4 at gate ${gate}: ${reason}`, at: new Date().toISOString(), source: "strike-4" };
    halted = true;
  }
  appendSprintLog(paths, `strike ${strikes} ${task.id} gate=${gate}${halted ? " HALTED" : ""}`);
  return { strikes, halted };
}

async function runConsolidateLogs(paths: SprintPaths, state: SprintState) {
  if (!existsSync(paths.logsDir)) return { message: "logs dir does not exist — nothing to consolidate", sha: null, fileCount: 0 };
  const logFiles = readdirSync(paths.logsDir).filter((f) => f.endsWith(".log")).sort();
  if (logFiles.length === 0) return { message: "no task log files found — already consolidated or no tasks ran", sha: null, fileCount: 0 };

  const sep = "─".repeat(80);
  const lines: string[] = [`# Sprint Task Logs — ${state.name}`, `# Consolidated ${logFiles.length} log file(s) on ${new Date().toISOString()}`, ""];
  for (const file of logFiles) {
    lines.push(sep, `## ${file}`, sep, readFileSync(join(paths.logsDir, file), "utf8").trimEnd(), "");
  }
  writeFileSync(paths.sprintTasksLog, lines.join("\n") + "\n");
  for (const file of logFiles) unlinkSync(join(paths.logsDir, file));

  const logsDirRel = `${SPRINT_ROOT_REL}/${state.name}/logs`;
  const consolidatedLogRel = `${SPRINT_ROOT_REL}/${state.name}/sprint-tasks.log`;
  const sha = await commitLogsConsolidation({ sprintName: state.name, logsDirRel, consolidatedLogRel });
  appendSprintLog(paths, `consolidated ${logFiles.length} task log(s) -> sprint-tasks.log${sha ? ` sha=${sha}` : " (no-op)"}`);
  return { message: sha ? `Consolidated ${logFiles.length} log file(s) @ ${sha.slice(0, 7)}` : "sprint-tasks.log already up-to-date", sha, fileCount: logFiles.length };
}

const server = new McpServer({ name: "sprint-orchestrator", version: "0.1.0" });

server.registerTool(
  "sprint_start",
  {
    description: "Create sprint/{name} branch, scaffold docs/sprint/{name}/, init sprint-state.json. Requires interviewConfirmed=true.",
    inputSchema: {
      name: z.string(),
      goal: z.string(),
      interviewConfirmed: z.boolean(),
      caseNumber: z.string().optional(),
    },
  },
  async ({ name: rawName, goal, interviewConfirmed, caseNumber }) => {
    if (!interviewConfirmed) {
      throw new Error("sprint_start refused: interviewConfirmed is false. Run the planning-interview skill and get human confirmation first.");
    }
    const trimmedCase = (caseNumber ?? "").trim() || undefined;
    const name = trimmedCase ? `${trimmedCase}-${rawName}` : rawName;
    const paths = sprintPaths(CWD, name);
    ensureSprintDirs(paths);
    await startSprintBranch(`sprint/${name}`);
    if (!existsSync(paths.state)) {
      const state: SprintState = {
        name,
        branch: `sprint/${name}`,
        phase: "planning",
        createdAt: new Date().toISOString(),
        ...(trimmedCase ? { caseNumber: trimmedCase } : {}),
        tasks: [],
      };
      saveState(paths, state);
      writeFileSync(paths.sprintLog, `# Sprint: ${name}\nGoal: ${goal}\n`);
    }
    ACTIVE_SPRINT = name;
    appendSprintLog(paths, `sprint_start name=${name}`);
    return { content: [{ type: "text", text: `Sprint ${name} ready on branch sprint/${name}. Phase: planning.` }] };
  },
);

server.registerTool(
  "sprint_state_get",
  { description: "Read the current sprint-state.json.", inputSchema: {} },
  async () => {
    const { state } = requireActive();
    return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }] };
  },
);

server.registerTool(
  "sprint_tasks_seed",
  {
    description: "PM-time: seed tasks from plan.md into sprint-state.json and flip phase to development.",
    inputSchema: {
      tasks: z.array(z.object({ id: z.string(), title: z.string(), story: z.string(), files: z.array(z.string()) })),
    },
  },
  async ({ tasks }) => {
    const { state, paths } = requireActive();
    if (state.phase !== "planning-approved") {
      throw new Error(`cannot seed tasks: phase is ${state.phase}, expected planning-approved`);
    }
    const count = seedTasks(state, tasks);
    saveState(paths, state);
    appendSprintLog(paths, `seeded ${count} tasks; phase -> development`);
    return { content: [{ type: "text", text: `Seeded ${count} tasks. Phase -> development.` }] };
  },
);

server.registerTool(
  "gate_pass",
  {
    description: "Report that a gate PASSED for a task. Advances mechanically to the next gate.",
    inputSchema: { taskId: z.string(), gate: z.string() },
  },
  async ({ taskId, gate }) => {
    const { state, paths } = requireActive();
    if (state.phase !== "development") throw new Error(`gate_pass refused: phase is '${state.phase}', expected 'development'.`);
    const task = findTask(state, taskId);
    const g = gate as Gate;
    if (g === "commit" || g === "done") throw new Error(`gate_pass refused: '${g}' is not reportable — use commit_task.`);
    if (task.gate !== g) throw new Error(`gate_pass refused: ${task.id} is at gate '${task.gate}', not '${g}'.`);
    transition(task, nextGate(g));
    saveState(paths, state);
    appendSprintLog(paths, `gate_pass ${task.id} ${g} -> ${task.gate}`);
    return { content: [{ type: "text", text: `${task.id}: ${g} passed -> now at ${task.gate}` }] };
  },
);

server.registerTool(
  "task_log_append",
  {
    description: "Append a timestamped line to the per-task log.",
    inputSchema: { taskId: z.string(), agent: z.string(), attempt: z.number(), line: z.string() },
  },
  async ({ taskId, agent, attempt, line }) => {
    const { paths } = requireActive();
    const file = taskLogPath(paths, taskId, agent, attempt);
    appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
    return { content: [{ type: "text", text: `logged to ${file}` }] };
  },
);

server.registerTool(
  "strike_record",
  {
    description: "Record a gate failure against a task. Halts sprint on strike 4.",
    inputSchema: { taskId: z.string(), gate: z.string(), reason: z.string() },
  },
  async ({ taskId, gate, reason }) => {
    const { state, paths } = requireActive();
    const task = findTask(state, taskId);
    const { strikes, halted } = applyStrike(state, paths, task, gate as Gate, reason);
    saveState(paths, state);
    const text = halted ? "STRIKE 4 — SPRINT HALTED." : strikes === 3 ? "STRIKE 3 — pull in architect before builder retry." : `Strike ${strikes}/4. Restart from builder.`;
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "sprint_state_unhalt",
  {
    description: "Clear the halted flag after a human-approved fix.",
    inputSchema: { reason: z.string(), resetTask: z.boolean().optional() },
  },
  async ({ reason, resetTask }) => {
    const { state, paths } = requireActive();
    if (!state.halted) throw new Error("sprint is not halted — nothing to unhalt");
    if (!reason.trim()) throw new Error("sprint_state_unhalt requires a non-empty reason");
    const haltSource = state.halted.source ?? "manual";
    const shouldReset = resetTask ?? haltSource === "strike-4";
    let taskReset: string | undefined;
    if (shouldReset) {
      const inFlight = state.tasks.find((t) => t.gate !== "done");
      if (inFlight) {
        inFlight.gate = "builder";
        inFlight.gates = {};
        inFlight.attempts = 0;
        inFlight.strikes = [];
        taskReset = inFlight.id;
      }
    }
    delete state.halted;
    saveState(paths, state);
    appendSprintLog(paths, `unhalt: ${reason}${taskReset ? ` (reset ${taskReset})` : ""}`);
    return { content: [{ type: "text", text: `Sprint unhalted.${taskReset ? ` ${taskReset} reset to builder.` : ""}` }] };
  },
);

server.registerTool(
  "sprint_halt",
  { description: "Manually halt the sprint (equivalent to strike 4).", inputSchema: { reason: z.string() } },
  async ({ reason }) => {
    const { state, paths } = requireActive();
    state.halted = { reason, at: new Date().toISOString(), source: "manual" };
    saveState(paths, state);
    appendSprintLog(paths, `manual HALT: ${reason}`);
    return { content: [{ type: "text", text: `Sprint halted: ${reason}` }] };
  },
);

server.registerTool(
  "verify_run",
  { description: "Runs `mix precommit`. Gate 4 — nothing commits until this is green.", inputSchema: {} },
  async () => {
    const { state, paths } = requireActive();
    const result = await runVerify(DEFAULT_STEPS);
    appendSprintLog(paths, `verify ${result.ok ? "PASS" : `FAIL@${result.failedStep}`}`);
    const current = state.phase === "development" ? state.tasks.find((t) => t.gate !== "done") : undefined;
    let note = "";
    if (current && current.gate === "verify") {
      if (result.ok) {
        transition(current, "commit");
        note = `\n${current.id} advanced to commit — call commit_task("${current.id}") now.`;
      } else {
        const { strikes, halted } = applyStrike(state, paths, current, "verify", `verify failed at ${result.failedStep}`);
        note = halted ? "\nSTRIKE 4 — SPRINT HALTED." : `\nStrike ${strikes}/4 on ${current.id} — task reset to builder.`;
      }
      saveState(paths, state);
    }
    return { content: [{ type: "text", text: (result.ok ? "✅ verify green" : `❌ verify failed at "${result.failedStep}"`) + note }], isError: !result.ok };
  },
);

server.registerTool(
  "commit_task",
  { description: "Authors the single commit for a task. Refuses unless every gate is green.", inputSchema: { taskId: z.string() } },
  async ({ taskId }) => {
    const { state, paths } = requireActive();
    const task = findTask(state, taskId);
    if (!readyToCommit(task)) throw new Error(`task ${task.id} is not ready to commit — gates: ${JSON.stringify(task.gates)}`);
    const sha = await commitTask({
      sprintName: state.name,
      sprintRootRel: `${SPRINT_ROOT_REL}/${state.name}`,
      taskId: task.id,
      title: task.title,
      storyRef: task.story,
      gateSummary: "Builder: ✅  Tester: ✅  Reviewer: ✅  Security: ✅  Verify: ✅",
      files: task.files,
      ...(state.caseNumber ? { caseNumber: state.caseNumber } : {}),
    });
    task.commitSha = sha;
    transition(task, "done");
    maybeCompletePhase(state);
    saveState(paths, state);
    appendSprintLog(paths, `commit ${task.id} sha=${sha}`);
    return { content: [{ type: "text", text: `committed ${task.id} @ ${sha}` }] };
  },
);

server.registerTool(
  "consolidate_logs",
  { description: "Merge per-task logs into sprint-tasks.log, verify, delete originals, commit.", inputSchema: {} },
  async () => {
    const { state, paths } = requireActive();
    const result = await runConsolidateLogs(paths, state);
    return { content: [{ type: "text", text: result.message }] };
  },
);

server.registerTool(
  "sprint_merge",
  { description: "Merge sprint/{name} into main with --no-ff.", inputSchema: {} },
  async () => {
    const { state, paths } = requireActive();
    if (state.phase !== "final-review") throw new Error(`cannot merge: phase is ${state.phase}, expected final-review`);
    await runConsolidateLogs(paths, state);
    state.phase = "closed";
    saveState(paths, state);
    const sha = await mergeSprint(state.branch);
    return { content: [{ type: "text", text: `merged ${state.branch} -> main @ ${sha}` }] };
  },
);

server.registerTool(
  "sprint_approve_planning",
  { description: "Runs mix precommit against the planning tree, commits planning artifacts, flips phase -> planning-approved.", inputSchema: {} },
  async () => {
    const { state, paths } = requireActive();
    if (state.phase !== "planning") throw new Error(`cannot approve planning: phase is ${state.phase}`);
    const result = await runVerify(DEFAULT_STEPS);
    if (!result.ok) {
      appendSprintLog(paths, `approve-planning BLOCKED: verify failed @ ${result.failedStep}`);
      return { content: [{ type: "text", text: `Approval BLOCKED: verify failed at "${result.failedStep}".` }], isError: true };
    }
    state.phase = "planning-approved";
    saveState(paths, state);
    const goal = readGoal(paths);
    const sha = await commitPlanning({ sprintName: state.name, goal });
    appendSprintLog(paths, `human approved planning; verify green; planning commit ${sha ?? "(no diff)"}`);
    return { content: [{ type: "text", text: sha ? `Planning approved. Committed @ ${sha.slice(0, 7)}.` : "Planning approved. (Nothing to commit.)" }] };
  },
);

server.registerTool(
  "sprint_approve_close",
  { description: "Consolidate logs, then push+PR (default) or merge locally (local=true).", inputSchema: { local: z.boolean().optional() } },
  async ({ local }) => {
    const { state, paths } = requireActive();
    if (state.phase !== "final-review") throw new Error(`Cannot close: phase is ${state.phase}, expected final-review.`);
    await runConsolidateLogs(paths, state);
    state.phase = "closed";
    saveState(paths, state);

    if (local) {
      const sha = await mergeSprint(state.branch);
      return { content: [{ type: "text", text: `Sprint closed. Merged ${state.branch} -> main @ ${sha.slice(0, 7)}.` }] };
    }

    await pushBranch(state.branch);
    const taskLines = state.tasks.filter((t) => t.gate === "done").map((t) => `- **${t.id}**: ${t.title}`).join("\n");
    const prBody = `## Sprint: ${state.name}\n\n### Tasks\n\n${taskLines}\n\n### Verification\n\nAll gates green.\n\nSprint artifacts: \`docs/sprint/${state.name}/\``;
    const prUrl = await createPullRequest({ title: sprintNameToTitle(state.name, state.caseNumber), body: prBody, base: "main", branch: state.branch });
    return { content: [{ type: "text", text: `PR created: ${prUrl}` }] };
  },
);

server.registerTool(
  "setup_project",
  { description: "One-time project scaffolding: docs/, SPEC.md, static-analysis config, mix.exs patch, .gitignore patch.", inputSchema: {} },
  async () => {
    const templateDir = new URL("../templates", import.meta.url).pathname;
    const result = runSetup(CWD, templateDir);
    const lines = [
      `Created ${result.created.length} file(s): ${result.created.join(", ") || "(none)"}`,
      `Skipped (already exists) ${result.skipped.length} file(s): ${result.skipped.join(", ") || "(none)"}`,
      result.mixExsPatched ? "mix.exs patched." : `mix.exs NOT patched: ${result.mixExsNote}`,
      result.gitignorePatched ? ".gitignore patched with sprint artifact patterns." : ".gitignore already had sprint patterns.",
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

function readGoal(paths: SprintPaths): string {
  try {
    const content = readFileSync(paths.sprintLog, "utf8");
    const m = content.match(/^Goal:\s*(.+)$/m);
    return m ? m[1].trim() : "(goal not recorded)";
  } catch {
    return "(sprint.log unreadable)";
  }
}

function sprintNameToTitle(name: string, caseNumber?: string): string {
  const slug = caseNumber ? name.replace(new RegExp(`^${caseNumber}-`), "") : name;
  const label = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return caseNumber ? `${caseNumber} - ${label}` : label;
}

currentBranch()
  .then((br) => {
    const m = br.match(/^sprint\/(.+)$/);
    if (m) ACTIVE_SPRINT = m[1];
  })
  .catch(() => {})
  .finally(async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });
```

- [ ] **Step 2: Write `.mcp.json`**

```json
// .mcp.json
{
  "mcpServers": {
    "sprint-orchestrator": {
      "command": "npx",
      "args": ["tsx", "${CLAUDE_PLUGIN_ROOT}/mcp/src/index.ts"],
      "env": {}
    }
  }
}
```

- [ ] **Step 3: Manually verify the server starts and lists its tools**

Run: `cd mcp && npx tsx src/index.ts &` then, in another shell, use an MCP inspector
(`npx @modelcontextprotocol/inspector npx tsx mcp/src/index.ts`) or a minimal stdio
client to send a `tools/list` request.
Expected: response lists all 15 registered tool names from Task 10's `server.registerTool` calls.
Kill the background server afterward.

- [ ] **Step 4: Commit**

```bash
git add mcp/src/index.ts .mcp.json
git commit -m "Wire up sprint-orchestrator MCP server with all sprint tools"
```

---

### Task 11: Hooks — bash-git-guard and ownership-guard

**Files:**
- Create: `hooks/bash-git-guard.ts`
- Create: `hooks/ownership-guard.ts`

**Interfaces:**
- Consumes: `lib/git-guard.ts` (`extractGitSubcommand`, `BLOCKED_GIT_SUBCOMMANDS`),
  `lib/ownership.ts` (`pathOwnedBy`), `lib/paths.ts` (`sprintPaths`), `lib/state.ts`
  (`loadState`, `SprintState`)
- Produces: two CLI scripts that read a Claude Code `PreToolUse` hook event as JSON on
  stdin and communicate a block/allow decision. Exit code 2 + a message on stderr blocks
  the tool call (the long-standing, stable Claude Code hook contract); exit 0 allows it.
  **Verify this against a live Claude Code session in Step 4** — the plugin docs table
  fetched during design didn't include the exact PreToolUse payload/response schema, only
  the event name and high-level behavior ("can block it"), so this is the one piece of
  the whole plan built on an assumption rather than a confirmed API.

- [ ] **Step 1: Write `hooks/bash-git-guard.ts`**

```ts
// hooks/bash-git-guard.ts
import { extractGitSubcommand, BLOCKED_GIT_SUBCOMMANDS } from "../lib/git-guard.js";

interface PreToolUseEvent {
  tool_name?: string;
  tool_input?: { command?: string };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as PreToolUseEvent;
  if (event.tool_name !== "Bash") process.exit(0);

  const command = event.tool_input?.command ?? "";
  const sub = extractGitSubcommand(command);
  if (!sub || !BLOCKED_GIT_SUBCOMMANDS.includes(sub)) process.exit(0);

  process.stderr.write(
    `Blocked 'git ${sub}'. Sprint tooling owns git mutations — use the sprint-orchestrator MCP tools ` +
      `(commit_task / sprint_merge / sprint_approve_close), not ad-hoc git commands.\n`,
  );
  process.exit(2);
}

main();
```

- [ ] **Step 2: Write `hooks/ownership-guard.ts`**

```ts
// hooks/ownership-guard.ts
import { sprintPaths, SPRINT_ROOT_REL } from "../lib/paths.js";
import { loadState } from "../lib/state.js";
import { pathOwnedBy } from "../lib/ownership.js";

interface PreToolUseEvent {
  tool_name?: string;
  tool_input?: { file_path?: string };
  cwd?: string;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function block(reason: string): never {
  process.stderr.write(reason + "\n");
  process.exit(2);
}

async function main() {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as PreToolUseEvent;
  if (event.tool_name !== "Write" && event.tool_name !== "Edit") process.exit(0);

  const cwd = event.cwd ?? process.cwd();
  const rawPath = event.tool_input?.file_path ?? "";
  const cwdPrefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  const path = rawPath.startsWith(cwdPrefix) ? rawPath.slice(cwdPrefix.length) : rawPath;

  // Find the active sprint from the current branch, mirroring the MCP server's
  // own branch-derived ACTIVE_SPRINT resolution, but stateless: re-derived every call.
  const { execFileSync } = await import("node:child_process");
  let branch: string;
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }).toString().trim();
  } catch {
    process.exit(0); // not a git repo — not our concern
  }
  const m = branch.match(/^sprint\/(.+)$/);
  if (!m) process.exit(0); // not on a sprint branch — guard stays out of the way

  const paths = sprintPaths(cwd, m[1]);
  const state = loadState(paths);
  if (!state) process.exit(0);

  const sprintRootRel = `${SPRINT_ROOT_REL}/${state.name}`;
  if (path === sprintRootRel || path.startsWith(`${sprintRootRel}/`)) process.exit(0);

  if (state.tasks.length === 0) {
    const allowed = ["docs/", "test/", "config/", "priv/"].some((p) => path.startsWith(p));
    if (!allowed) {
      block(
        `${path} is outside allowed planning-phase paths (docs/, test/, config/, priv/). ` +
          "Production code cannot be written until the plan is approved and tasks are seeded.",
      );
    }
    process.exit(0);
  }

  const current = state.tasks.find((t) => t.gate !== "done");
  if (current && current.files.some((f) => pathOwnedBy(path, f))) process.exit(0);

  const futureOwners = current
    ? state.tasks.filter((t) => t !== current && t.gate !== "done" && t.files.some((f) => pathOwnedBy(path, f)))
    : [];
  if (futureOwners.length > 0) {
    const where = futureOwners.map((t) => `${t.id} (gate ${t.gate})`).join(", ");
    block(`${path} belongs to a later task (${where}). Finish the current task before touching these files.`);
  }

  block(
    `${path} is not claimed by any task in the sprint plan. Declare it in plan.md (and re-seed) ` +
      "or route the change through a polish-{n} task.",
  );
}

main();
```

- [ ] **Step 3: Type-check both hooks**

Run: `cd hooks && npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 bash-git-guard.ts ownership-guard.ts`
Expected: no errors (uses the `lib/` types)

- [ ] **Step 4: Manually verify the exit-code contract against a live session**

Once hooks are wired via `hooks.json` (Task 13) and the plugin is loaded in a real
Claude Code session, attempt `git commit` via the `Bash` tool on a non-sprint branch and
confirm it's blocked with the guard's message; attempt an `Edit` outside any declared
task ownership on a sprint branch with a seeded plan and confirm it's blocked too. If the
hook I/O contract turns out to differ (e.g. a JSON `{"decision": "block", ...}` stdout
response is required instead of/in addition to exit code 2), update both scripts'
`block`/exit logic to match and re-verify — the pure logic underneath (`extractGitSubcommand`,
`pathOwnedBy`) is already covered by Task 4's unit tests and does not change.

- [ ] **Step 5: Commit**

```bash
git add hooks/bash-git-guard.ts hooks/ownership-guard.ts
git commit -m "Add bash-git-guard and ownership-guard hooks"
```

---

### Task 12: Hook — session-start

**Files:**
- Create: `hooks/session-start.ts`

**Interfaces:**
- Consumes: nothing beyond `node:child_process` (mirrors the original's minimal startup guard)
- Produces: a `SessionStart` hook that warns when the session starts on `main`/`master`.

- [ ] **Step 1: Write `hooks/session-start.ts`**

```ts
// hooks/session-start.ts
import { execFileSync } from "node:child_process";

function main() {
  let branch: string;
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
  } catch {
    process.exit(0); // not a git repo — not our concern
  }

  if (branch === "main" || branch === "master") {
    const output = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          `⚠ You're on ${branch}. Sprint work happens on sprint/{name} — ` +
          "use /sprint:resume if one already exists, or the orchestrator skill's sprint_start tool to begin one.",
      },
    };
    process.stdout.write(JSON.stringify(output));
  }
  process.exit(0);
}

main();
```

- [ ] **Step 2: Manually verify against a live session**

Start a Claude Code session in a git repo on `main` with the plugin enabled; confirm the
warning appears in context at session start (check via `/context` or by asking Claude
what branch it thinks it's on). If `additionalContext` isn't the right output key for
`SessionStart` in the installed Claude Code version, adjust the JSON shape and re-verify
— this is the same category of unverified-contract risk noted in Task 11.

- [ ] **Step 3: Commit**

```bash
git add hooks/session-start.ts
git commit -m "Add session-start hook warning when on main/master"
```

---

### Task 13: `hooks/hooks.json` — wire all three hooks

**Files:**
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: `hooks/session-start.ts`, `hooks/bash-git-guard.ts`, `hooks/ownership-guard.ts` (Tasks 11–12)

- [ ] **Step 1: Write `hooks/hooks.json`**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.ts\""
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx \"${CLAUDE_PLUGIN_ROOT}/hooks/bash-git-guard.ts\""
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx \"${CLAUDE_PLUGIN_ROOT}/hooks/ownership-guard.ts\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the plugin manifest doesn't need an explicit `hooks` pointer**

`hooks/hooks.json` is the default location Claude Code scans automatically (per the
plugin reference: "Location: `hooks/hooks.json` in plugin root"), so no change to
`.claude-plugin/plugin.json` is required. Confirm by checking the file exists at exactly
that path: `test -f hooks/hooks.json && echo OK`.

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "Wire SessionStart and PreToolUse hooks into the plugin manifest"
```

---

### Task 14: Skills — orchestrator (the lifecycle driver)

**Files:**
- Create: `skills/orchestrator/SKILL.md`

**Interfaces:**
- Consumes (conceptually): the MCP tools from Task 10, the Task tool for subagent
  delegation, the `/sprint:*` commands from Task 18.

Port `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/orchestrator/SKILL.md` to
`skills/orchestrator/SKILL.md`. Read the source file, then apply exactly this
transformation:

1. **Frontmatter**: keep `name: orchestrator` and `description:` verbatim (the
   description text doesn't reference Pi-specific mechanics).
2. **Every `subagent({ agent: "X", task: "..." })` call** → rewrite as: "invoke the Task
   tool with `subagent_type: "X"` and the same prompt text."
3. **Every `subagent({ chain: "task-gates", task: taskId })` call** (there are two: in
   the Dev flow section and the Final review section) → rewrite as this exact inlined
   sequence, replacing the single line each time it appears:
   ```
   subagent({ chain: "task-gates", task: taskId })
   ```
   becomes:
   ```
   Invoke the Task tool four times in sequence for this task, waiting for each to finish
   before starting the next:
     1. subagent_type: "builder"   — writes production code, calls gate_pass(taskId, "builder")
     2. subagent_type: "tester"    — Gate 1, calls gate_pass(taskId, "tester") or strike_record
     3. subagent_type: "reviewer"  — Gate 2, calls gate_pass(taskId, "reviewer") or strike_record
     4. subagent_type: "security"  — Gate 3, calls gate_pass(taskId, "security") or strike_record
   Each step reads the task's plan.md entry and the prior step's log itself — you (the
   orchestrator) never re-send file contents between them.
   ```
4. **`/skill:planning-interview`** → `/planning-interview` (all three occurrences).
5. **`.pi/skills/planning-interview/SKILL.md`** → `the plugin's skills/planning-interview/SKILL.md`.
6. **`/skill:pair-sprint`** → `/pair-sprint`.
7. **The "Tool contract" table**: no change needed — tool names (`sprint_start`,
   `gate_pass`, `task_log_append`, `strike_record`, `sprint_state_unhalt`, `verify_run`,
   `commit_task`, `sprint_merge`) are unchanged; only add one row: `polish_task_append` →
   `polish_task_append`'s Pi description said "subagent(pm) calls polish_task_append" —
   change to "the pm subagent (Task tool, subagent_type: pm) calls polish_task_append".
   Note: `polish_task_append` is not yet a registered MCP tool as of Task 10 — add it to
   Task 10's `index.ts` in this task's Step 3 below (it was omitted from the initial tool
   list; the state-machine logic `appendPolishTask` from Task 3 already exists).
8. **`pi-subagents` / "a new Pi process with its own context window"** → "a fresh Claude
   Code subagent with its own context window".
9. **`maxSubagentDepth: 1 is enforced per-agent`** (last line) → "Subagents never spawn
   their own subagents — enforced by omitting the Task tool from every sprint agent's
   `tools:` list."

- [ ] **Step 1: Read the source and write the transformed skill**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/orchestrator/SKILL.md` in full,
apply the 9 transformations above, and write the result to `skills/orchestrator/SKILL.md`.

- [ ] **Step 2: Verify no Pi-specific syntax remains**

Run: `grep -n 'subagent(\|/skill:\|\.pi/\|pi-subagents\|maxSubagentDepth' skills/orchestrator/SKILL.md`
Expected: no matches.

- [ ] **Step 3: Add the missing `polish_task_append` MCP tool**

`skills/orchestrator/SKILL.md` references `polish_task_append`, which Task 10's
`index.ts` doesn't yet register. Add it now:

```ts
// add to mcp/src/index.ts, alongside the other server.registerTool calls
server.registerTool(
  "polish_task_append",
  {
    description: "Final-review-time: append a single polish-{n} task. Flips phase to development for the duration.",
    inputSchema: { id: z.string(), title: z.string(), story: z.string(), files: z.array(z.string()) },
  },
  async ({ id, title, story, files }) => {
    const { state, paths } = requireActive();
    const prev = state.phase;
    appendPolishTask(state, { id, title, story, files });
    saveState(paths, state);
    appendSprintLog(paths, `polish_task_append ${id}${prev !== state.phase ? ` (phase ${prev} -> ${state.phase})` : ""}`);
    return { content: [{ type: "text", text: `Appended ${id}. Phase is now ${state.phase}.` }] };
  },
);
```

(`appendPolishTask` is already imported in `index.ts` from Task 10's import list.)

- [ ] **Step 4: Re-run the MCP server type-check**

Run: `cd mcp && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add skills/orchestrator/SKILL.md mcp/src/index.ts
git commit -m "Port orchestrator skill; register polish_task_append MCP tool"
```

---

### Task 15: Skills — the seven gate-role skills

**Files:**
- Create: `skills/builder/SKILL.md`
- Create: `skills/tester/SKILL.md`
- Create: `skills/reviewer/SKILL.md`
- Create: `skills/security/SKILL.md`
- Create: `skills/architect/SKILL.md`
- Create: `skills/product-owner/SKILL.md`
- Create: `skills/pm/SKILL.md`

Each source file lives at
`/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/<name>/SKILL.md`. For each of the
seven, read the source and apply this transformation table (the same table for all
seven — none of these skills reference chains, only the orchestrator does):

| Find | Replace |
|---|---|
| `/skill:<name>` (any skill name) | `/<name>` |
| `subagent(...)` phrasing describing how this role gets invoked | "invoked via the Task tool with the matching `subagent_type`" |
| `gate_pass(taskId, "<gate>")` | unchanged — MCP tool name and call shape are identical |
| `task_log_append(...)` | unchanged |
| `pi-subagents` | "Claude Code subagents" |
| references to `.pi/skills/` or `.pi/agents/` | "the plugin's `skills/`" / "the plugin's `agents/`" |

- [ ] **Step 1: Port `builder`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/builder/SKILL.md`, apply the
table, write to `skills/builder/SKILL.md`.

- [ ] **Step 2: Port `tester`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/tester/SKILL.md`, apply the
table, write to `skills/tester/SKILL.md`.

- [ ] **Step 3: Port `reviewer`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/reviewer/SKILL.md`, apply the
table, write to `skills/reviewer/SKILL.md`.

- [ ] **Step 4: Port `security`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/security/SKILL.md`, apply the
table, write to `skills/security/SKILL.md`.

- [ ] **Step 5: Port `architect`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/architect/SKILL.md`, apply the
table, write to `skills/architect/SKILL.md`.

- [ ] **Step 6: Port `product-owner`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/product-owner/SKILL.md`, apply
the table, write to `skills/product-owner/SKILL.md`.

- [ ] **Step 7: Port `pm`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/pm/SKILL.md`, apply the table,
write to `skills/pm/SKILL.md`.

- [ ] **Step 8: Verify no Pi-specific syntax remains across all seven**

Run: `grep -rln 'subagent(\|/skill:\|\.pi/\|pi-subagents' skills/builder skills/tester skills/reviewer skills/security skills/architect skills/product-owner skills/pm`
Expected: no matches. Fix any file the transformation table missed.

- [ ] **Step 9: Commit**

```bash
git add skills/builder skills/tester skills/reviewer skills/security skills/architect skills/product-owner skills/pm
git commit -m "Port the seven gate-role skills (builder/tester/reviewer/security/architect/product-owner/pm)"
```

---

### Task 16: Skills — planning-interview, pair-programmer, pair-sprint, styleguide-check

**Files:**
- Create: `skills/planning-interview/SKILL.md`
- Create: `skills/pair-programmer/SKILL.md`
- Create: `skills/pair-sprint/SKILL.md`
- Create: `skills/styleguide-check/SKILL.md`

Same transformation table as Task 15, applied to each of these four source files at
`/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/<name>/SKILL.md`. `pair-sprint` and
`pair-programmer` are the two most likely to reference `subagent({ chain: ... })` (since
they describe dev-loop variants) — if either does, apply the same chain-inlining rewrite
from Task 14 Step 3 (inline the four-step builder→tester→reviewer→security sequence) at
that call site.

- [ ] **Step 1: Port `planning-interview`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/planning-interview/SKILL.md`,
apply the transformation table, write to `skills/planning-interview/SKILL.md`.

- [ ] **Step 2: Port `pair-programmer`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/pair-programmer/SKILL.md`,
apply the transformation table (and the chain-inlining rewrite if a chain call is
present), write to `skills/pair-programmer/SKILL.md`.

- [ ] **Step 3: Port `pair-sprint`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/pair-sprint/SKILL.md`, apply the
transformation table (and the chain-inlining rewrite if a chain call is present), write
to `skills/pair-sprint/SKILL.md`.

- [ ] **Step 4: Port `styleguide-check`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/skills/styleguide-check/SKILL.md`,
apply the transformation table, write to `skills/styleguide-check/SKILL.md`.

- [ ] **Step 5: Verify no Pi-specific syntax remains**

Run: `grep -rln 'subagent(\|/skill:\|\.pi/\|pi-subagents\|chain:' skills/planning-interview skills/pair-programmer skills/pair-sprint skills/styleguide-check`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add skills/planning-interview skills/pair-programmer skills/pair-sprint skills/styleguide-check
git commit -m "Port planning-interview, pair-programmer, pair-sprint, styleguide-check skills"
```

---

### Task 17: `skills/setup/SKILL.md` and `commands/setup.md`

**Files:**
- Create: `skills/setup/SKILL.md`
- Create: `commands/setup.md`

**Interfaces:**
- Consumes: the `setup_project` MCP tool (Task 10)

This skill has no Pi original — it's new, replacing `mix pi_dev_setup`'s CLI ergonomics.

- [ ] **Step 1: Write `skills/setup/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Write `commands/setup.md`**

```markdown
---
description: Scaffold the sprint tooling's project-specific files (docs/, SPEC.md, mix.exs patch) into this Phoenix project.
---

Invoke the `setup` skill.
```

- [ ] **Step 3: Commit**

```bash
git add skills/setup commands/setup.md
git commit -m "Add setup skill and /setup command (replaces mix pi_dev_setup)"
```

---

### Task 18: Commands — `commands/sprint/*.md`

**Files:**
- Create: `commands/sprint/status.md`
- Create: `commands/sprint/resume.md`
- Create: `commands/sprint/approve-planning.md`
- Create: `commands/sprint/approve-close.md`
- Create: `commands/sprint/halt.md`
- Create: `commands/sprint/unhalt.md`

**Interfaces:**
- Consumes: `sprint_state_get`, `sprint_approve_planning`, `sprint_approve_close`,
  `sprint_halt`, `sprint_state_unhalt` MCP tools (Task 10)

- [ ] **Step 1: Write `commands/sprint/status.md`**

```markdown
---
description: Show sprint state summary.
---

Call the `sprint_state_get` MCP tool. Summarize the result for the human: sprint name,
phase, task counts (done vs. total), whether halted, and the current in-flight task's
gate if any. If the tool errors because no sprint is active, tell the human plainly and
suggest `/sprint:resume` if they're on a `sprint/{name}` branch.
```

- [ ] **Step 2: Write `commands/sprint/resume.md`**

```markdown
---
description: Resume the sprint on the current branch.
---

Check the current git branch. If it matches `sprint/{name}`, call `sprint_state_get` to
confirm `sprint-state.json` exists for that name and report the phase to the human. If
the branch doesn't match `sprint/{name}`, tell the human they're not on a sprint branch.
```

- [ ] **Step 3: Write `commands/sprint/approve-planning.md`**

```markdown
---
description: "Human approval gate: run mix precommit against the planning tree, commit planning artifacts, flip phase -> planning-approved."
---

Call the `sprint_approve_planning` MCP tool with no arguments. Relay its result verbatim
to the human — if it reports the approval was blocked because verify failed, say so
plainly and do not proceed to the next planning step until the human has fixed the
planning artifacts and re-runs this command.
```

- [ ] **Step 4: Write `commands/sprint/approve-close.md`**

```markdown
---
description: "Human approval gate: consolidate task logs, then push+open a GitHub PR (default) or merge into main locally (pass --local)."
argument-hint: "[--local]"
---

If the command arguments include `--local`, call `sprint_approve_close` with
`{ "local": true }`. Otherwise call it with `{ "local": false }` (or omit the field —
both mean the same thing). Relay the resulting PR URL or local-merge confirmation to the
human.
```

- [ ] **Step 5: Write `commands/sprint/halt.md`**

```markdown
---
description: Manually halt the sprint (equivalent to a strike-4 halt).
argument-hint: "<reason>"
---

Call the `sprint_halt` MCP tool with `{ "reason": "<the command argument text>" }`. If no
reason was given, ask the human for one before calling the tool — `sprint_halt` requires
a reason.
```

- [ ] **Step 6: Write `commands/sprint/unhalt.md`**

```markdown
---
description: Clear the halted flag after a human-approved fix.
argument-hint: "<what was fixed>"
---

Call the `sprint_state_unhalt` MCP tool with `{ "reason": "<the command argument text>" }`.
If no reason was given, ask the human to describe what was fixed before calling the tool
— `sprint_state_unhalt` requires a non-empty reason. Relay the result, including whether
an in-flight task was reset to the builder gate.
```

- [ ] **Step 7: Commit**

```bash
git add commands/sprint
git commit -m "Add /sprint:* commands as thin wrappers over the MCP tools"
```

---

### Task 19: Agents — the nine sprint subagents

**Files:**
- Create: `agents/builder.md`
- Create: `agents/architect.md`
- Create: `agents/architect-final.md`
- Create: `agents/pm.md`
- Create: `agents/product-owner.md`
- Create: `agents/reviewer.md`
- Create: `agents/security.md`
- Create: `agents/tester.md`
- Create: `agents/tester-planning.md`

**Interfaces:**
- Consumes: the corresponding skill from Tasks 14–16 (via `skills:` frontmatter field,
  which plugin agents support directly), the MCP tools from Task 10 (via scoped `tools:`
  names)

Each source file lives at
`/Users/jbosse/Projects/mix_pi_dev_setup/.pi/agents/<name>.md`. Read each, and rewrite
its frontmatter to the Claude Code plugin-agent schema, keeping the body prose
(everything after the `---` closing the frontmatter) unchanged except for the same
`/skill:name` → `/name` and `subagent(...)` → "Task tool" rewrites used in Tasks 14–16
wherever the body references them.

**Frontmatter mapping rule** (apply to every one of the nine): drop `systemPromptMode`,
`inheritProjectContext`, `inheritSkills`, `defaultContext`, `maxSubagentDepth` entirely
(no Claude Code equivalent is needed — see the design spec's component-mapping table).
Keep `name`, `description` verbatim. Convert the Pi `tools:` comma-list to a Claude Code
YAML list, translating tool names: `read`→`Read`, `grep`→`Grep`, `find`→`Glob`,
`ls`→`Glob`, `write`→`Write`, `edit`→`Edit`, `bash`→`Bash`, and any sprint-orchestrator
tool name (`gate_pass`, `task_log_append`, `strike_record`, etc.) →
`mcp__no-crap-claude_sprint-orchestrator__<same-name>` (the scoped plugin-MCP-tool name
format — **verify this exact format against a running instance before finalizing**, per
the design spec's Open Risk #1; if it differs, this task's Step 8 below is where to fix
it). Convert the Pi `skills:` list to a Claude Code `skills:` YAML list of the same skill
names (plugin agents support this field directly). Never include `Task` or `Agent` in
any of these nine agents' `tools:` — that's what enforces depth-1.

- [ ] **Step 1: Port `builder`**

Read `/Users/jbosse/Projects/mix_pi_dev_setup/.pi/agents/builder.md`. Its original
frontmatter is:
```yaml
---
name: builder
description: Writes production code to make failing tests pass for the current task. Bound by declared file ownership (extension guard enforces). Never edits tests. Reports completion via gate_pass(taskId, "builder") only.
systemPromptMode: replace
inheritProjectContext: true
inheritSkills: false
defaultContext: fresh
maxSubagentDepth: 1
tools: read, grep, find, ls, write, edit, bash, task_log_append, gate_pass
skills: builder, styleguide-check
---
```
Write `agents/builder.md` with:
```yaml
---
name: builder
description: Writes production code to make failing tests pass for the current task. Bound by declared file ownership (hook guard enforces). Never edits tests. Reports completion via gate_pass(taskId, "builder") only.
tools: Read, Grep, Glob, Write, Edit, Bash, mcp__no-crap-claude_sprint-orchestrator__task_log_append, mcp__no-crap-claude_sprint-orchestrator__gate_pass
skills: builder, styleguide-check
---
```
followed by the original body text, with "extension guard" → "hook guard" and any
`subagent(...)`/`/skill:` occurrences rewritten per the standing rule.

- [ ] **Step 2: Port `architect`, `architect-final`, `pm`, `product-owner`**

For each of these four, read the source at
`/Users/jbosse/Projects/mix_pi_dev_setup/.pi/agents/<name>.md`, apply the frontmatter
mapping rule from this task's header (same mechanical translation demonstrated in Step
1: drop Pi-only fields, translate `tools:`, keep `skills:`), and write to
`agents/<name>.md` with the body text rewritten per the standing `/skill:`/`subagent(...)`
rules.

- [ ] **Step 3: Port `reviewer`, `security`, `tester`, `tester-planning`**

Same as Step 2, for these four remaining agents.

- [ ] **Step 4: Verify every agent's frontmatter parses and contains no Pi-only fields**

Run:
```bash
grep -rln 'systemPromptMode\|inheritProjectContext\|inheritSkills\|defaultContext\|maxSubagentDepth' agents/
```
Expected: no matches.

- [ ] **Step 5: Verify no agent grants itself Task/Agent**

Run: `grep -rn '^tools:.*\(Task\|Agent\)' agents/`
Expected: no matches — confirms depth-1 is enforced for all nine.

- [ ] **Step 6: Verify no Pi-specific body syntax remains**

Run: `grep -rln 'subagent(\|/skill:\|\.pi/' agents/`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add agents
git commit -m "Port the nine sprint subagents with Claude Code plugin-agent frontmatter"
```

- [ ] **Step 8 (conditional — only if Task 11/12's live-session check revealed a
  different MCP scoped-tool-name format): fix every `mcp__no-crap-claude_sprint-orchestrator__*`
  reference across all nine agent files to match the confirmed format, then re-run Steps
  4–6 and commit the correction.**

---

### Task 20: End-to-end manual verification

**Files:**
- None created — this task exercises the whole system against a scratch project.

**Interfaces:**
- Consumes: everything from Tasks 1–19.

- [ ] **Step 1: Create a scratch Phoenix project**

Run:
```bash
cd /tmp && mix phx.new scratch_sprint_test --no-mailer && cd scratch_sprint_test && git init && git add -A && git commit -m "initial"
```

- [ ] **Step 2: Load the plugin against the scratch project**

Run: `claude --plugin-dir /Users/jbosse/Projects/no-crap-claude` from inside
`/tmp/scratch_sprint_test`.
Expected: session starts with no errors; the `SessionStart` hook does not fire a warning
(scratch project isn't on `main` if you created a branch, or fire the expected warning if
it is — either is correct, just confirm it matches).

- [ ] **Step 3: Run setup**

In the session, say "run setup" (or `/setup`).
Expected: `docs/`, `SPEC.md`, `.credo.exs`, etc. appear in `/tmp/scratch_sprint_test`;
`mix.exs` gains the `dialyzer:` block, the four tooling deps, and the expanded
`precommit:` alias; `.gitignore` gains the sprint patterns.

- [ ] **Step 4: Run `mix deps.get` and confirm the project still compiles**

Run: `mix deps.get && mix compile`
Expected: succeeds (new deps resolve, patched `mix.exs` is syntactically valid).

- [ ] **Step 5: Start a sprint and walk the planning phase**

In the session, invoke `/orchestrator`, let it run the planning interview for a trivial
scope ("add a health check endpoint"), confirm it refuses to call `sprint_start` before
the interview is confirmed, then confirm it proceeds through PO → human-approval →
architect → tester-planning → pm once confirmed.
Expected: `docs/sprint/{name}/sprint-state.json` is created with `phase: "planning"`;
`user-stories.md` is shown to you for approval before `qa-script.md` is written.

- [ ] **Step 6: Verify the ownership guard blocks an out-of-scope write**

While a task is in flight (phase `development`), manually ask Claude to edit a file not
listed in the current task's `files`.
Expected: the edit is blocked with the ownership-guard's message.

- [ ] **Step 7: Verify the bash-git-guard blocks an ad-hoc commit**

Ask Claude to run `git commit -am "test"` directly via Bash.
Expected: blocked with the bash-git-guard's message, regardless of sprint phase.

- [ ] **Step 8: Run one task through the full gate chain and confirm a commit lands**

Let the orchestrator run one seeded task through builder → tester → reviewer → security →
verify → commit.
Expected: exactly one commit appears in `git log`, message format matches
`[sprint/{name}] {task-id}: {title}` with the gate-summary line.

- [ ] **Step 9: Clean up the scratch project**

Run: `rm -rf /tmp/scratch_sprint_test`

- [ ] **Step 10: Record any deviations found in Steps 2–8 as follow-up notes**

If any step's actual behavior differed from "Expected" (most likely around the hook I/O
contract flagged in Tasks 11–12, or the MCP scoped-tool-name format flagged in Task 19),
document the correction directly in the affected task's files and commit — this step has
no separate deliverable beyond those fixes being made and committed under their own
task's commit message.

---

## Self-Review Notes

- **Spec coverage**: every component in the design spec's file tree and component-mapping
  table has a task — plugin manifest (1), `lib/` (2–4), MCP server (5–10, plus the
  `polish_task_append` addition in 14), hooks (11–13), templates (8), skills (14–17),
  commands (17–18), agents (19), and end-to-end verification (20). The two "NEW" MCP
  tools from the spec (`sprint_approve_planning`, `sprint_approve_close`) and the
  `sprint_halt` tool added during self-review of the spec are all registered in Task 10.
  `setup_project` is covered by Tasks 8–9 (templates + logic) and 10 (registration).
- **Placeholder scan**: no "TBD"/"similar to Task N"/unshown-code steps remain — the
  content-porting tasks (14–19) specify exact source paths and exact, concrete
  transformation rules (find/replace tables, one fully-worked frontmatter example in
  Task 19 Step 1) rather than vague instructions, since reproducing 15 full markdown
  files verbatim in this plan would be pure duplication of already-read source text.
- **Type consistency**: `SprintPaths`, `SprintState`, `TaskState`, `Gate`, `Phase`,
  `TaskSeedInput` are defined once in `lib/state.ts`/`lib/paths.ts` (Tasks 2–3) and
  imported by name (never redefined) in `mcp/src/git.ts`, `mcp/src/index.ts`, and both
  ownership/session hooks. `runSetup`'s `SetupResult` shape (Task 9) matches exactly what
  `index.ts`'s `setup_project` tool handler consumes (Task 10).
- **Two flagged unknowns carried forward from the spec** (Task 11 Step 4, Task 12 Step 2,
  Task 19 Step 8): the exact Claude Code `PreToolUse`/`SessionStart` hook JSON contract
  and the exact scoped MCP tool-name format for plugin-bundled servers. Both are isolated
  to small, clearly-marked verification steps — the pure logic everything else depends on
  (`state.ts`, `ownership.ts`, `git-guard.ts`, `mix-exs-patcher.ts`, `setup.ts`) is fully
  unit-tested and does not depend on either unknown.
