/** 默认从 repository inventory 遍历中排除的目录名。 */
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
