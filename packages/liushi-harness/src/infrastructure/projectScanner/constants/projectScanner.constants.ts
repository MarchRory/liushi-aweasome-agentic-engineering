/** Directory names excluded from repository inventory traversal by default. */
export const DEFAULT_IGNORED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "out",
]);
