// mcp/src/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { maxBuffer: 20 * 1024 * 1024 });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? String(err), code: e.code ?? 1 };
  }
}

export async function currentBranch(): Promise<string> {
  const { stdout, code } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (code !== 0) throw new Error("not a git repo or HEAD detached");
  return stdout.trim();
}

export async function branchExists(branch: string): Promise<boolean> {
  const { code } = await run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  return code === 0;
}

export async function startSprintBranch(branch: string): Promise<void> {
  const head = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head.stdout.trim() === branch) return;

  if (await branchExists(branch)) {
    const { code, stderr } = await run("git", ["checkout", branch]);
    if (code !== 0) throw new Error(`git checkout ${branch} failed: ${stderr}`);
    return;
  }
  const { code, stderr } = await run("git", ["checkout", "-b", branch]);
  if (code !== 0) throw new Error(`git checkout -b ${branch} failed: ${stderr}`);
}

export interface CommitInput {
  sprintName: string;
  sprintRootRel: string;
  taskId: string;
  title: string;
  storyRef: string;
  gateSummary: string;
  files: string[];
  caseNumber?: string;
}

export async function workingTreeStatus(): Promise<Array<{ status: string; path: string }>> {
  const { stdout, code } = await run("git", ["status", "--porcelain"]);
  if (code !== 0) throw new Error("git status --porcelain failed");
  return stdout
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => ({ status: l.slice(0, 2), path: l.slice(3) }));
}

export async function commitPlanning(input: { sprintName: string; goal: string }): Promise<string | null> {
  const add = await run("git", ["add", "-A"]);
  if (add.code !== 0) throw new Error(`git add -A failed: ${add.stderr}`);

  const diff = await run("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return null;

  const msg = `[sprint/${input.sprintName}] planning: approved\n\nGoal: ${input.goal}\nAgents: PO, Architect, Tester, PM\n`;
  const commit = await run("git", ["commit", "-m", msg]);
  if (commit.code !== 0) throw new Error(`git commit (planning) failed: ${commit.stderr}`);

  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

function ownedBy(path: string, entry: string): boolean {
  if (path === entry) return true;
  const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
  if (path.startsWith(entryPrefix)) return true;
  const pathPrefix = path.endsWith("/") ? path : `${path}/`;
  if (entry.startsWith(pathPrefix)) return true;
  return false;
}

export async function commitTask(input: CommitInput): Promise<string> {
  const dirty = await workingTreeStatus();
  const unowned = dirty.filter(({ path }) => {
    if (path.startsWith(`${input.sprintRootRel}/`)) return false;
    return !input.files.some((f) => ownedBy(path, f));
  });

  if (unowned.length > 0) {
    const summary = unowned.map((d) => `  ${d.status} ${d.path}`).join("\n");
    throw new Error(
      `commit_task refused: working tree has changes outside task ${input.taskId}'s declared ownership:\n${summary}\n\n` +
        "Either amend this task's file ownership to cover them, route them through a polish-{n} task, " +
        "or revert the changes before retrying.",
    );
  }

  const dirtyPaths = dirty.filter(({ path }) => !path.startsWith(`${input.sprintRootRel}/`)).map(({ path }) => path);
  if (dirtyPaths.length > 0) {
    const addDeclared = await run("git", ["add", "--", ...dirtyPaths]);
    if (addDeclared.code !== 0) throw new Error(`git add (task files) failed: ${addDeclared.stderr}`);
  }

  const addArtifacts = await run("git", ["add", "--", input.sprintRootRel]);
  if (addArtifacts.code !== 0) throw new Error(`git add (sprint artifacts) failed: ${addArtifacts.stderr}`);

  const msg =
    `[sprint/${input.sprintName}] ${input.taskId}: ${input.title}\n\n` +
    `${input.storyRef}\n${input.gateSummary}\n` +
    (input.caseNumber ? `\n${input.caseNumber}\n` : "");

  const commit = await run("git", ["commit", "-m", msg]);
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`);

  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function commitLogsConsolidation(input: {
  sprintName: string;
  logsDirRel: string;
  consolidatedLogRel: string;
}): Promise<string | null> {
  const lsLogs = await run("git", ["ls-files", "--", input.logsDirRel]);
  if (lsLogs.stdout.trim().length > 0) {
    const addLogs = await run("git", ["add", "-A", "--", input.logsDirRel]);
    if (addLogs.code !== 0) throw new Error(`git add (log deletions) failed: ${addLogs.stderr}`);
  }

  const addConsolidated = await run("git", ["add", "--", input.consolidatedLogRel]);
  if (addConsolidated.code !== 0) throw new Error(`git add (sprint-tasks.log) failed: ${addConsolidated.stderr}`);

  const diff = await run("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return null;

  const msg = `[sprint/${input.sprintName}] consolidate task logs → sprint-tasks.log\n`;
  const commit = await run("git", ["commit", "-m", msg]);
  if (commit.code !== 0) throw new Error(`git commit (consolidate logs) failed: ${commit.stderr}`);

  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function commitDocsUpdate(input: { sprintName: string; paths: string[] }): Promise<string | null> {
  const existing = input.paths.filter((p) => existsSync(p));
  if (existing.length === 0) return null;
  const add = await run("git", ["add", "--", ...existing]);
  if (add.code !== 0) throw new Error(`git add (docs update) failed: ${add.stderr}`);
  const diff = await run("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return null;
  const commit = await run("git", ["commit", "-m", `[sprint/${input.sprintName}] docs: living-doc updates at close`]);
  if (commit.code !== 0) throw new Error(`docs update commit failed: ${commit.stderr}`);
  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function commitClosedState(input: { sprintName: string; sprintRootRel: string }): Promise<string | null> {
  const add = await run("git", ["add", "--", input.sprintRootRel]);
  if (add.code !== 0) throw new Error(`git add (closed state) failed: ${add.stderr}`);
  const diff = await run("git", ["diff", "--cached", "--quiet"]);
  if (diff.code === 0) return null;
  const commit = await run("git", ["commit", "-m", "close: finalize sprint-state.json (phase=closed)"]);
  if (commit.code !== 0) throw new Error(`close commit failed: ${commit.stderr}`);
  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function mergeSprint(sprintBranch: string): Promise<string> {
  const dirty = await run("git", ["status", "--porcelain"]);
  if (dirty.stdout.trim().length > 0) throw new Error("working tree dirty — cannot merge");
  const co = await run("git", ["checkout", "main"]);
  if (co.code !== 0) throw new Error(`git checkout main failed: ${co.stderr}`);
  const merge = await run("git", ["merge", "--no-ff", sprintBranch, "-m", `Merge ${sprintBranch}`]);
  if (merge.code !== 0) throw new Error(`git merge failed: ${merge.stderr}`);
  const sha = await run("git", ["rev-parse", "HEAD"]);
  return sha.stdout.trim();
}

export async function pushBranch(branch: string): Promise<void> {
  const push = await run("git", ["push", "-u", "origin", branch]);
  if (push.code !== 0) throw new Error(`git push -u origin ${branch} failed: ${push.stderr}`);
}

export async function createPullRequest(opts: {
  title: string;
  body: string;
  base: string;
  branch: string;
}): Promise<string> {
  const result = await run("gh", ["pr", "create", "--title", opts.title, "--body", opts.body, "--base", opts.base, "--head", opts.branch]);
  if (result.code !== 0) throw new Error(`gh pr create failed: ${result.stderr}`);
  return result.stdout.trim();
}
