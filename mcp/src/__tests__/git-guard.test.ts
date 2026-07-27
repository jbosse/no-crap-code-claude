import { describe, it, expect } from "vitest";
import { extractGitSubcommand, hasBlockedGitSubcommand, BLOCKED_GIT_SUBCOMMANDS } from "../../../lib/git-guard.js";

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

describe("hasBlockedGitSubcommand", () => {
  it("detects a blocked subcommand hidden in a later segment of a compound command", () => {
    expect(hasBlockedGitSubcommand("git add -A && git commit -m x")).toBe("commit");
  });

  it("allows a compound command with no blocked subcommand in any segment", () => {
    expect(hasBlockedGitSubcommand("git status && git diff")).toBeUndefined();
  });

  it("detects blocked subcommands across other shell control operators", () => {
    expect(hasBlockedGitSubcommand("git status; git push")).toBe("push");
    expect(hasBlockedGitSubcommand("git log | grep foo || git reset --hard")).toBe("reset");
  });

  it("returns undefined for a single safe command", () => {
    expect(hasBlockedGitSubcommand("git status")).toBeUndefined();
  });
});
