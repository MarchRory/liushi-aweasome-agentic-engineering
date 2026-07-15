import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ContentDigestPort, ManagedFileStateReader } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  MANAGED_FILES_MANIFEST_PATH,
  ManagedFileActualKind,
  createMissingManagedManifest,
  parseManagedManifest,
  type ActualManagedFileState,
  type ManagedManifestSnapshot,
} from "#domain/installation/index.js";
import {
  normalizePathIdentity,
  samePathIdentity,
} from "#infrastructure/system/platformCompatibility/index.js";

/** 基于 lstat 的只读 Repository 受管文件读取器，拒绝所有符号链接。 */
export class NodeManagedFileStateReaderAdapter implements ManagedFileStateReader {
  /** 注入与 InstallPlan 相同的规范摘要计算器。 */
  public constructor(private readonly digest: ContentDigestPort) {}

  /** 使用平台大小写规则生成稳定的受管路径身份。 */
  public identifyPath(path: string): string {
    return normalizePathIdentity(path);
  }

  /** 校验 Repository 根目录并返回真实平台路径。 */
  public async resolveRoot(root: string): Promise<Result<string, HarnessErrorType>> {
    return resolveRepositoryRoot(root);
  }

  /** 验证 root 和父路径后读取指定普通文件状态。 */
  public async readActual(
    root: string,
    path: string,
  ): Promise<Result<ActualManagedFileState, HarnessErrorType>> {
    const target = await resolveSafeTarget(root, path);
    if (target.status === ResultStatus.Failure) return target;
    try {
      const stat = await lstat(target.value);
      if (!stat.isFile()) return success({ path, kind: ManagedFileActualKind.Unsupported });
      const content = await readFile(target.value, "utf8");
      const digest = this.digest.calculate(content);
      return digest.status === ResultStatus.Failure
        ? digest
        : success({ path, kind: ManagedFileActualKind.RegularFile, digest: digest.value });
    } catch (error) {
      return isNodeError(error) && error.code === "ENOENT"
        ? success({ path, kind: ManagedFileActualKind.Missing })
        : failure(
            new HarnessError(
              HarnessErrorCode.IoFailure,
              "Unable to read managed file state.",
              { path },
              error,
            ),
          );
    }
  }

  /** 严格读取 manifest，缺失时返回空清单且不创建目录。 */
  public async readManifest(
    root: string,
  ): Promise<Result<ManagedManifestSnapshot, HarnessErrorType>> {
    const target = await resolveSafeTarget(root, MANAGED_FILES_MANIFEST_PATH);
    if (target.status === ResultStatus.Failure) return target;
    try {
      const stat = await lstat(target.value);
      if (!stat.isFile())
        return failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Managed file manifest is not a regular file.",
          ),
        );
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(target.value, "utf8"));
      } catch (error) {
        return failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Managed file manifest is invalid JSON.",
            {},
            error,
          ),
        );
      }
      return parseManagedManifest(parsed);
    } catch (error) {
      return isNodeError(error) && error.code === "ENOENT"
        ? success(createMissingManagedManifest())
        : failure(
            new HarnessError(
              HarnessErrorCode.IoFailure,
              "Unable to read managed file manifest.",
              {},
              error,
            ),
          );
    }
  }
}

async function resolveSafeTarget(
  root: string,
  path: string,
): Promise<Result<string, HarnessErrorType>> {
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
            "Unable to validate repository root.",
            { root },
            error,
          ),
    );
  }
}

async function resolveRepositoryRoot(root: string): Promise<Result<string, HarnessErrorType>> {
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
        {},
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
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
