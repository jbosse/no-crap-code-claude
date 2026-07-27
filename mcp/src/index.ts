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
  commitClosedState,
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
    await commitClosedState({ sprintName: state.name, sprintRootRel: `${SPRINT_ROOT_REL}/${state.name}` });
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
    await commitClosedState({ sprintName: state.name, sprintRootRel: `${SPRINT_ROOT_REL}/${state.name}` });

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
