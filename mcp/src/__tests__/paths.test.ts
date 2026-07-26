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
