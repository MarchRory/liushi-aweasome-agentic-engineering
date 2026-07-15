import { lstat, readFile } from "node:fs/promises";

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
  bindManagedManifestSnapshot,
  createMissingManagedManifest,
  parseManagedManifest,
  type ActualManagedFileState,
  type ManagedFileContentSnapshot,
  type ManagedManifestSnapshot,
} from "#domain/installation/index.js";
import {
  findMissingRepositoryParentDirectories,
  normalizePathIdentity,
  resolveRepositoryRoot,
  resolveSafeRepositoryTarget,
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
    const target = await resolveSafeRepositoryTarget(root, path);
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

  /** 读取并校验可供 rollback journal 使用的完整内容前镜像。 */
  public async readContentSnapshot(
    root: string,
    path: string,
  ): Promise<Result<ManagedFileContentSnapshot, HarnessErrorType>> {
    const target = await resolveSafeRepositoryTarget(root, path);
    if (target.status === ResultStatus.Failure) return target;
    try {
      const stat = await lstat(target.value);
      if (!stat.isFile() || stat.isSymbolicLink())
        return failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "Managed file preimage must be a regular non-symbolic file.",
            { path },
          ),
        );
      const content = await readFile(target.value, "utf8");
      const digest = this.digest.calculate(content);
      return digest.status === ResultStatus.Failure
        ? digest
        : success({
            path,
            kind: ManagedFileActualKind.RegularFile,
            content,
            digest: digest.value,
          });
    } catch (error) {
      return isNodeError(error) && error.code === "ENOENT"
        ? success({ path, kind: ManagedFileActualKind.Missing })
        : failure(
            new HarnessError(
              HarnessErrorCode.IoFailure,
              "Unable to read managed file preimage.",
              { path },
              error,
            ),
          );
    }
  }

  /** 读取目标集合缺失的父目录，不产生任何 Repository 副作用。 */
  public async findMissingParentDirectories(
    root: string,
    paths: readonly string[],
  ): Promise<Result<readonly string[], HarnessErrorType>> {
    return findMissingRepositoryParentDirectories(root, paths);
  }

  /** 严格读取 manifest，缺失时返回空清单且不创建目录。 */
  public async readManifest(
    root: string,
  ): Promise<Result<ManagedManifestSnapshot, HarnessErrorType>> {
    const target = await resolveSafeRepositoryTarget(root, MANAGED_FILES_MANIFEST_PATH);
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
      let content: string;
      let parsed: unknown;
      try {
        content = await readFile(target.value, "utf8");
        parsed = JSON.parse(content) as unknown;
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
      const manifest = parseManagedManifest(parsed);
      if (manifest.status === ResultStatus.Failure) return manifest;
      const digest = this.digest.calculate(content);
      return digest.status === ResultStatus.Failure
        ? digest
        : success(bindManagedManifestSnapshot(manifest.value, content, digest.value));
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
