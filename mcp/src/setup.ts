// mcp/src/setup.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, chmodSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { globSync } from "node:fs";
import { patch as patchMixExs } from "./mix-exs-patcher.js";

const ROOT_DOTFILES: Record<string, string> = {
  "credo.exs": ".credo.exs",
  "dialyzer_ignore.exs": ".dialyzer_ignore.exs",
  "sobelow-conf": ".sobelow-conf",
};

const EXECUTABLES = ["spawn-agent", "remove-agent"];

export interface Substitution {
  from: string;
  to: string;
}

function camelize(appName: string): string {
  return appName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function substitutions(appName: string, opts: { date?: string } = {}): Substitution[] {
  const appModule = camelize(appName);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  return [
    { from: "__APP_WEB_MODULE__", to: `${appModule}Web` },
    { from: "__APP_MODULE__", to: appModule },
    { from: "__APP_WEB_NAME__", to: `${appName}_web` },
    { from: "__APP_NAME__", to: appName },
    { from: "__GENERATED_DATE__", to: date },
  ];
}

export function applySubstitutions(content: string, subs: Substitution[]): string {
  return subs.reduce((acc, { from, to }) => acc.split(from).join(to), content);
}

export interface FileMapping {
  templateRel: string;
  dest: string;
}

function destination(templateRel: string): string {
  if (templateRel in ROOT_DOTFILES) return ROOT_DOTFILES[templateRel];
  return templateRel;
}

export function fileMappings(templateDir: string): FileMapping[] {
  const entries = globSync("**/*", { cwd: templateDir, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(templateDir, join(e.parentPath, e.name)))
    .filter((rel) => !rel.endsWith(".DS_Store"))
    .sort();
  return entries.map((rel) => ({ templateRel: rel, dest: destination(rel) }));
}

export function detectAppName(mixExsContent: string): string {
  const m = mixExsContent.match(/app:\s*:([a-z0-9_]+)/);
  if (!m) throw new Error("could not find `app: :name` in mix.exs");
  return m[1];
}

const SPRINT_GITIGNORE_SENTINEL = "docs/sprint/*/logs/";
const SPRINT_GITIGNORE_BLOCK = `
# Sprint planning working docs (intermediate — not committed to the repo)
# Only sprint-review.md and qa-script.md are committed; everything else is ephemeral.
docs/sprint/*/logs/
docs/sprint/*/sprint-state.json
docs/sprint/*/sprint.log
docs/sprint/*/planning-summary.md
docs/sprint/*/architecture.md
docs/sprint/*/plan.md
docs/sprint/*/spec.md
docs/sprint/*/user-stories.md
docs/sprint/*/reviewer-checklist.md
`;

export interface SetupResult {
  created: string[];
  skipped: string[];
  mixExsPatched: boolean;
  mixExsNote?: string;
  gitignorePatched: boolean;
}

export function runSetup(cwd: string, templateDir: string): SetupResult {
  const mixExsPath = join(cwd, "mix.exs");
  if (!existsSync(mixExsPath)) {
    throw new Error("mix.exs not found — run setup from the root of a Phoenix project");
  }
  const appName = detectAppName(readFileSync(mixExsPath, "utf8"));
  const subs = substitutions(appName);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const { templateRel, dest } of fileMappings(templateDir)) {
    const destPath = join(cwd, dest);
    if (existsSync(destPath)) {
      skipped.push(dest);
      continue;
    }
    const rendered = applySubstitutions(readFileSync(join(templateDir, templateRel), "utf8"), subs);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, rendered);
    created.push(dest);
  }

  for (const exe of EXECUTABLES) {
    const p = join(cwd, exe);
    if (existsSync(p)) {
      const mode = statSync(p).mode;
      chmodSync(p, mode | 0o111);
    }
  }

  mkdirSync(join(cwd, "priv", "plts"), { recursive: true });
  const gitkeep = join(cwd, "priv", "plts", ".gitkeep");
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, "");
    created.push("priv/plts/.gitkeep");
  } else {
    skipped.push("priv/plts/.gitkeep");
  }

  const original = readFileSync(mixExsPath, "utf8");
  const patched = patchMixExs(original);
  const mixExsPatched = patched !== original;
  let mixExsNote: string | undefined;
  if (mixExsPatched) {
    writeFileSync(mixExsPath, patched);
  } else {
    mixExsNote = "could not auto-patch mix.exs (no matching anchors) — see manualInstructions()";
  }

  const gitignorePath = join(cwd, ".gitignore");
  const existingGitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  let gitignorePatched = false;
  if (!existingGitignore.includes(SPRINT_GITIGNORE_SENTINEL)) {
    const separator = existingGitignore.endsWith("\n") || existingGitignore === "" ? "" : "\n";
    writeFileSync(gitignorePath, existingGitignore + separator + "\n" + SPRINT_GITIGNORE_BLOCK);
    gitignorePatched = true;
  }

  return { created, skipped, mixExsPatched, mixExsNote, gitignorePatched };
}
