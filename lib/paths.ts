import { lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";

export const SPRINT_ROOT_REL = "docs/sprint";

// Stable pointer to the sprint currently in flight, e.g. a symlink
// `docs/sprint/current` -> `docs/sprint/64123-fix-sorting`.
//
// Why this exists: subagent prompts and skill docs name paths like
// `/docs/sprint/{name}/plan.md`, but a subagent with Read/Grep/Glob tools is
// not physically prevented from wandering into sibling sprint directories —
// re-reading a past sprint's plan.md, architecture.md, etc. as "context."
// `docs/sprint/` accumulates one directory per sprint forever, so that keeps
// getting more expensive and, worse, risks building against a superseded
// design. Every skill/agent path reads through `docs/sprint/current/...`
// instead of the literal sprint name, so there is only ever one sprint's
// files reachable through the documented path.
//
// Deliberately gitignored — this is session state, not a sprint artifact, so
// it never shows up in a task commit or a PR diff.
export const CURRENT_LINK_REL = `${SPRINT_ROOT_REL}/current`;

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

/**
 * Point `docs/sprint/current` at `sprintName`.
 *
 * Idempotent: an existing pointer (stale symlink, or a real directory some
 * earlier version created) is removed first, so switching sprints mid-session
 * repoints cleanly rather than failing EEXIST.
 *
 * Best-effort by design. A missing pointer degrades reads through
 * `docs/sprint/current` to a failed read, which the agent reports — that is
 * strictly better than taking down sprint tooling over a filesystem that
 * disallows symlinks.
 */
export function setCurrentSprintLink(cwd: string, sprintName: string): void {
  const link = join(cwd, CURRENT_LINK_REL);
  try {
    mkdirSync(join(cwd, SPRINT_ROOT_REL), { recursive: true });
    clearCurrentSprintLink(cwd);
    // Relative target keeps the link valid if the repo is moved or mounted
    // at a different path inside a container.
    symlinkSync(sprintName, link, "dir");
  } catch (err) {
    console.error(`[sprint] could not update ${CURRENT_LINK_REL}:`, err);
  }
}

/** Remove the pointer. Safe to call when it does not exist. */
export function clearCurrentSprintLink(cwd: string): void {
  const link = join(cwd, CURRENT_LINK_REL);
  try {
    // lstat, not exists: a symlink pointing at a deleted sprint dir is
    // dangling, and existsSync follows the link and reports false for it.
    lstatSync(link);
  } catch {
    return; // nothing there
  }
  try {
    rmSync(link, { recursive: true, force: true });
  } catch (err) {
    console.error(`[sprint] could not remove ${CURRENT_LINK_REL}:`, err);
  }
}

export function taskLogPath(paths: SprintPaths, taskId: string, agent: string, attempt: number): string {
  const n = String(attempt).padStart(2, "0");
  return join(paths.logsDir, `${taskId}-${agent}-${n}.log`);
}
