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
