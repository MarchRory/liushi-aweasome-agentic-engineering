import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import { samePathIdentity } from "./pathIdentity.js";

/** 校验 Repository 根目录，并返回不经过符号链接的真实绝对路径。 */
export async function resolveRepositoryRoot(root: string): Promise<Result<string, HarnessError>> {
  if (!isAbsolute(root))
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Repository root must be absolute."),
    );
  try {
    const rootStat = await lstat(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory())
      return failure(
        new HarnessError(
          HarnessErrorCode.OperationForbidden,
          "Repository root must be an existing non-symbolic directory.",
        ),
      );
    const realRoot = await realpath(root);
    return samePathIdentity(realRoot, resolve(root))
      ? success(realRoot)
      : failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "Repository root must not resolve through a symbolic link.",
          ),
        );
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "Unable to validate repository root.",
        { root },
        error,
      ),
    );
  }
}

/** 将受限相对路径解析到 Repository 内，并拒绝现有父路径中的符号链接。 */
export async function resolveSafeRepositoryTarget(
  root: string,
  path: string,
): Promise<Result<string, HarnessError>> {
  if (!isSafeRelativePath(path))
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Repository root or managed path is invalid.",
        { path },
      ),
    );
  try {
    const resolvedRoot = await resolveRepositoryRoot(root);
    if (resolvedRoot.status === ResultStatus.Failure) return resolvedRoot;
    const realRoot = resolvedRoot.value;
    let current = realRoot;
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) {
      current = resolve(current, part);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          return failure(
            new HarnessError(
              HarnessErrorCode.OperationForbidden,
              "Managed file parent path is unsupported.",
              { path },
            ),
          );
      } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") break;
        throw error;
      }
    }
    const candidate = resolve(realRoot, ...parts);
    return isWithin(realRoot, candidate)
      ? success(candidate)
      : failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "Managed file path escapes repository root.",
            { path },
          ),
        );
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(
            HarnessErrorCode.IoFailure,
            "Unable to validate managed repository path.",
            { root, path },
            error,
          ),
    );
  }
}

/** 盘点目标文件尚不存在的父目录，并拒绝非目录或符号链接父路径。 */
export async function findMissingRepositoryParentDirectories(
  root: string,
  paths: readonly string[],
): Promise<Result<readonly string[], HarnessError>> {
  const resolvedRoot = await resolveRepositoryRoot(root);
  if (resolvedRoot.status === ResultStatus.Failure) return resolvedRoot;
  const missing = new Set<string>();
  try {
    for (const path of paths) {
      const target = await resolveSafeRepositoryTarget(resolvedRoot.value, path);
      if (target.status === ResultStatus.Failure) return target;
      const parts = path.split("/");
      let current = resolvedRoot.value;
      for (let index = 0; index < parts.length - 1; index += 1) {
        current = resolve(current, parts[index] as string);
        const relativePath = parts.slice(0, index + 1).join("/");
        if (missing.has(relativePath)) continue;
        try {
          const stat = await lstat(current);
          if (stat.isSymbolicLink() || !stat.isDirectory())
            return failure(
              new HarnessError(
                HarnessErrorCode.OperationForbidden,
                "Managed file parent path is unsupported.",
                { path: relativePath },
              ),
            );
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") {
            for (let rest = index; rest < parts.length - 1; rest += 1)
              missing.add(parts.slice(0, rest + 1).join("/"));
            break;
          }
          throw error;
        }
      }
    }
    return success([...missing].sort(comparePath));
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(
            HarnessErrorCode.IoFailure,
            "Unable to inspect managed repository directories.",
            { root },
            error,
          ),
    );
  }
}

function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  );
}

function isWithin(root: string, value: string): boolean {
  const part = relative(root, value);
  return part.length > 0 && !part.startsWith(`..${sep}`) && part !== ".." && !isAbsolute(part);
}

function comparePath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
