// hooks/bash-git-guard.ts
import { hasBlockedGitSubcommand } from "../lib/git-guard.js";

interface PreToolUseEvent {
  tool_name?: string;
  tool_input?: { command?: string };
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

async function main() {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as PreToolUseEvent;
  if (event.tool_name !== "Bash") process.exit(0);

  const command = event.tool_input?.command ?? "";
  const sub = hasBlockedGitSubcommand(command);
  if (!sub) process.exit(0);

  // Sprint tooling only owns git mutations on an actual sprint branch. Outside
  // one — a different repo entirely, or the same repo on `main` — this guard
  // has no sprint state to protect and must stay out of the way, mirroring
  // ownership-guard.ts's own branch check.
  const cwd = event.cwd ?? process.cwd();
  const { execFileSync } = await import("node:child_process");
  let branch: string;
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }).toString().trim();
  } catch {
    process.exit(0); // not a git repo — not our concern
  }
  if (!branch.match(/^sprint\/(.+)$/)) process.exit(0);

  process.stderr.write(
    `Blocked 'git ${sub}'. Sprint tooling owns git mutations — use the sprint-orchestrator MCP tools ` +
      `(commit_task / sprint_merge / sprint_approve_close), not ad-hoc git commands.\n`,
  );
  process.exit(2);
}

main();
