import { isAbsolute, normalize, relative, sep } from "node:path";

import type { ProjectPathCaseCollision } from "#application/ports/projectFileSystem/index.js";

/** Compares repository-relative paths using a locale-independent ordering. */
export function compareRelativePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Converts an absolute path into a repository-relative POSIX path. */
export function toRelativePosixPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

/** Creates the stable internal identity used for a real repository root. */
export function canonicalizeRootIdentity(realRoot: string): string {
  const normalized = normalize(realRoot);
  const withoutTrailingSeparator = normalized.replace(/[\\/]$/, "");
  return process.platform === "win32"
    ? withoutTrailingSeparator.toLocaleLowerCase("en-US")
    : withoutTrailingSeparator;
}

/** Tests whether a candidate path is the root or is lexically below the root. */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const candidateRelativePath = relative(root, candidate);
  return (
    candidateRelativePath === "" ||
    (!candidateRelativePath.startsWith(`..${sep}`) &&
      candidateRelativePath !== ".." &&
      !isAbsolute(candidateRelativePath))
  );
}

/** Compares collision records by their two relative paths. */
export function compareCaseCollisions(
  left: ProjectPathCaseCollision,
  right: ProjectPathCaseCollision,
): number {
  return (
    compareRelativePaths(left.firstPath, right.firstPath) ||
    compareRelativePaths(left.secondPath, right.secondPath)
  );
}

/** Normalizes an untrusted repository-relative path, or returns undefined when unsafe. */
export function normalizeRequestedRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    return undefined;
  }

  const slashPath = value.replaceAll("\\", "/");
  if (slashPath.startsWith("/") || slashPath.startsWith("//") || /^[A-Za-z]:\//u.test(slashPath)) {
    return undefined;
  }

  const segments = slashPath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return undefined;
  }

  const normalized = segments.filter((segment) => segment.length > 0).join("/");
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}
