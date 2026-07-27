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
