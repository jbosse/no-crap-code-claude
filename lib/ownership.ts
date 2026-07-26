export function pathOwnedBy(path: string, entry: string): boolean {
  if (path === entry) return true;
  const entryPrefix = entry.endsWith("/") ? entry : `${entry}/`;
  if (path.startsWith(entryPrefix)) return true;
  const pathPrefix = path.endsWith("/") ? path : `${path}/`;
  if (entry.startsWith(pathPrefix)) return true;
  return false;
}
