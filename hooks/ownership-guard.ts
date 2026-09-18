// hooks/ownership-guard.ts
import { sprintPaths, SPRINT_ROOT_REL, CURRENT_LINK_REL } from "../lib/paths.js";
import { loadState } from "../lib/state.js";
import { pathOwnedBy, isLivingDocPath } from "../lib/ownership.js";

interface PreToolUseEvent {
  tool_name?: string;
  tool_input?: { file_path?: string };
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

function block(reason: string): never {
  process.stderr.write(reason + "\n");
  process.exit(2);
}

async function main() {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as PreToolUseEvent;
  if (event.tool_name !== "Write" && event.tool_name !== "Edit") process.exit(0);

  const cwd = event.cwd ?? process.cwd();
  const rawPath = event.tool_input?.file_path ?? "";
  const cwdPrefix = cwd.endsWith("/") ? cwd : `${cwd}/`;
  const path = rawPath.startsWith(cwdPrefix) ? rawPath.slice(cwdPrefix.length) : rawPath;

  // Find the active sprint from the current branch, mirroring the MCP server's
  // own branch-derived ACTIVE_SPRINT resolution, but stateless: re-derived every call.
  const { execFileSync } = await import("node:child_process");
  let branch: string;
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }).toString().trim();
  } catch {
    process.exit(0); // not a git repo — not our concern
  }
  const m = branch.match(/^sprint\/(.+)$/);
  if (!m) process.exit(0); // not on a sprint branch — guard stays out of the way

  const paths = sprintPaths(cwd, m[1]);
  const state = loadState(paths);
  if (!state) process.exit(0);

  const sprintRootRel = `${SPRINT_ROOT_REL}/${state.name}`;
  // Agents write sprint docs through the `docs/sprint/current` pointer, not
  // the literal name — accept both so the guard doesn't block legitimate
  // planning/doc writes made through the pointer.
  if (
    path === sprintRootRel ||
    path.startsWith(`${sprintRootRel}/`) ||
    path === CURRENT_LINK_REL ||
    path.startsWith(`${CURRENT_LINK_REL}/`)
  ) {
    process.exit(0);
  }

  // Final-review's docs-update mode (PM, per ORCHESTRATION.md) targets a fixed
  // set of root-level living docs that no dev-phase task ever declares
  // ownership of. Without this, the guard would block every one of them the
  // moment the last task reaches `done` — the exact window docs-update runs in.
  if (state.phase === "final-review" && isLivingDocPath(path)) process.exit(0);

  if (state.tasks.length === 0) {
    const allowed = ["docs/", "test/", "config/", "priv/"].some((p) => path.startsWith(p));
    if (!allowed) {
      block(
        `${path} is outside allowed planning-phase paths (docs/, test/, config/, priv/). ` +
          "Production code cannot be written until the plan is approved and tasks are seeded.",
      );
    }
    process.exit(0);
  }

  const current = state.tasks.find((t) => t.gate !== "done");
  if (current && current.files.some((f) => pathOwnedBy(path, f))) process.exit(0);

  const futureOwners = current
    ? state.tasks.filter((t) => t !== current && t.gate !== "done" && t.files.some((f) => pathOwnedBy(path, f)))
    : [];
  if (futureOwners.length > 0) {
    const where = futureOwners.map((t) => `${t.id} (gate ${t.gate})`).join(", ");
    block(`${path} belongs to a later task (${where}). Finish the current task before touching these files.`);
  }

  block(
    `${path} is not claimed by any task in the sprint plan. Declare it in plan.md (and re-seed) ` +
      "or route the change through a polish-{n} task.",
  );
}

main();
