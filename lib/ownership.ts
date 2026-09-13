export function pathOwnedBy(path: string, entry: string): boolean {
  if (path === entry) return true;
  const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
  if (path.startsWith(entryPrefix)) return true;
  const pathPrefix = path.endsWith("/") ? path : `${path}/`;
  if (entry.startsWith(pathPrefix)) return true;
  return false;
}

/**
 * Root-level living docs that PM's docs-update mode (final-review / close)
 * targets per ORCHESTRATION.md — none of these are owned by any dev-phase
 * task's `files:` list, so the ownership guard would otherwise block every
 * write to them once all tasks reach `done`. ADRs are a directory prefix
 * since each sprint may add a new numbered file.
 */
export const LIVING_DOC_PATHS: readonly string[] = [
  "docs/architecture.md",
  "docs/project_memory.md",
  "docs/glossary.md",
  "CHANGELOG.md",
  "README.md",
];

const LIVING_DOC_PREFIXES: readonly string[] = ["docs/adr/"];

export function isLivingDocPath(path: string): boolean {
  if (LIVING_DOC_PATHS.includes(path)) return true;
  return LIVING_DOC_PREFIXES.some((prefix) => path.startsWith(prefix));
}
