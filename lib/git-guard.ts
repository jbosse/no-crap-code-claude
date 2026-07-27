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

/**
 * Splits a shell command on control operators (&&, ||, ;, |) and checks
 * every resulting segment for a blocked git subcommand. This prevents
 * compound commands like `git add -A && git commit -m x` from slipping
 * a blocked subcommand past a check that only looked at the first `git`
 * invocation in the whole string.
 */
export function hasBlockedGitSubcommand(command: string): string | undefined {
  const segments = command.split(/&&|\|\||;|\|/);
  for (const segment of segments) {
    const sub = extractGitSubcommand(segment);
    if (sub && BLOCKED_GIT_SUBCOMMANDS.includes(sub)) return sub;
  }
  return undefined;
}
