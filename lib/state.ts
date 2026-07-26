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
