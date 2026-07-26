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
