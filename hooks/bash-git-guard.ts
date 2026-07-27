// hooks/bash-git-guard.ts
import { extractGitSubcommand, BLOCKED_GIT_SUBCOMMANDS } from "../lib/git-guard.js";

interface PreToolUseEvent {
  tool_name?: string;
  tool_input?: { command?: string };
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
  const sub = extractGitSubcommand(command);
  if (!sub || !BLOCKED_GIT_SUBCOMMANDS.includes(sub)) process.exit(0);

  process.stderr.write(
    `Blocked 'git ${sub}'. Sprint tooling owns git mutations — use the sprint-orchestrator MCP tools ` +
      `(commit_task / sprint_merge / sprint_approve_close), not ad-hoc git commands.\n`,
  );
  process.exit(2);
}

main();
