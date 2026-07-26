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
