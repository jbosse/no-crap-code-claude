export const BLOCKED_GIT_SUBCOMMANDS = ["commit", "merge", "push", "reset", "rebase", "cherry-pick"];

const GIT_VALUE_FLAGS = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

export function extractGitSubcommand(command: string): string | undefined {
  const m = command.match(/\bgit\s+(.*)/s);
  if (!m) return undefined;
  const tokens = m[1].split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "") continue;
    if (GIT_VALUE_FLAGS.has(tok)) {
      i++;
      continue;
    }
    if (tok.startsWith("-")) continue;
    return tok;
  }
  return undefined;
}
