import { isAbsolute, relative, resolve } from "node:path";

import {
  rebuildSessionHookBinding,
  type HookBinding,
  type HookBindingStore,
  type HookWorkspaceBinding,
  type SessionHookBinding,
} from "#application/index.js";
import { isDurableParentDirectorySyncStatus } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { ExclusiveFileLockHandle } from "#infrastructure/persistence/fileEventStore/index.js";
import { samePathIdentity } from "#infrastructure/system/index.js";

import type { FileHookBindingStoreDependencies } from "../contracts/index.js";
import { readHookBindingFile, writeHookBindingFile } from "../io/index.js";
import { resolveHookBindingStorePaths } from "../path/index.js";

/** 使用原子 JSON 文件和排他 Lock 保存多仓 Codex Hook Binding。 */
export class FileHookBindingStore implements HookBindingStore {
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: FileHookBindingStoreDependencies,
  ) {}

  /** 新建或幂等复用同一工作区身份，不覆盖不同 Task 的既有绑定。 */
  public async bind(
    binding: HookWorkspaceBinding,
  ): Promise<Result<HookWorkspaceBinding, HarnessErrorType>>;
  public async bind(
    binding: SessionHookBinding,
  ): Promise<Result<SessionHookBinding, HarnessErrorType>>;
  public async bind(binding: HookBinding): Promise<Result<HookBinding, HarnessErrorType>> {
    const paths = resolveHookBindingStorePaths(this.storeRoot);
    const lock = await this.acquire(paths.lockFile);
    if (lock.status === ResultStatus.Failure) return lock;
    let result: Result<HookBinding, HarnessErrorType>;
    try {
      result = await this.bindLocked(binding, paths.recordFile);
    } catch (error) {
      result = failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "处理 Hook Binding 失败。",
          { recordFile: paths.recordFile },
          error,
        ),
      );
    }
    try {
      await lock.value.release();
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.HookBindingLockReleaseUnknown,
          "Hook Binding Lock 释放结果未知。",
          {
            lockFile: paths.lockFile,
            operationStatus: result.status,
            operationErrorCode:
              result.status === ResultStatus.Failure ? result.error.code : "not_applicable",
          },
          error,
        ),
      );
    }
    return result;
  }

  /** 查询当前 cwd 的最长祖先路径绑定。 */
  public async find(cwd: string): Promise<Result<HookBinding, HarnessErrorType>> {
    return this.findBinding(cwd);
  }

  /** 查询当前 cwd 的最长祖先路径绑定，并保留 v1/v2 完整类型。 */
  public async findBinding(cwd: string): Promise<Result<HookBinding, HarnessErrorType>> {
    const paths = resolveHookBindingStorePaths(this.storeRoot);
    const current = await readHookBindingFile(paths.recordFile, this.dependencies.digest);
    if (current.status === ResultStatus.Failure) return current;
    const normalizedCwd = resolve(cwd);
    const matches = current.value.filter((binding) =>
      isWithin(binding.workspaceRoot, normalizedCwd),
    );
    const match = matches.sort(
      (left, right) =>
        right.workspaceRoot.length - left.workspaceRoot.length ||
        bindingPriority(right) - bindingPriority(left),
    )[0];
    return match === undefined
      ? failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "当前 cwd 没有已绑定的 Harness Workspace。",
            { cwd: normalizedCwd },
          ),
        )
      : success(match);
  }

  /** 精确读取 v2 Session 绑定，找不到时不回退到 v1。 */
  public async findSession({
    workspaceId,
    sessionId,
  }: {
    readonly workspaceId: string;
    readonly sessionId: string;
  }): Promise<Result<SessionHookBinding, HarnessErrorType>> {
    const paths = resolveHookBindingStorePaths(this.storeRoot);
    const current = await readHookBindingFile(paths.recordFile, this.dependencies.digest);
    if (current.status === ResultStatus.Failure) return current;
    const matches = current.value.filter(
      (binding): binding is SessionHookBinding =>
        binding.schemaVersion === "2.0.0" &&
        binding.workspaceId === workspaceId &&
        binding.sessionId === sessionId,
    );
    return matches.length === 1
      ? success(matches[0] as SessionHookBinding)
      : failure(
          new HarnessError(
            HarnessErrorCode.OperationForbidden,
            "没有找到精确的 Session Hook Binding v2。",
            { workspaceId, sessionId },
          ),
        );
  }

  private normalize(binding: HookBinding): Result<HookBinding, HarnessErrorType> {
    if (binding.schemaVersion === "2.0.0") {
      if (this.dependencies.digest === undefined) {
        return failure(
          new HarnessError(HarnessErrorCode.InvalidInput, "v2 Binding 缺少 Digest Port。"),
        );
      }
      return rebuildSessionHookBinding(binding, this.dependencies.digest);
    }
    return success({ ...binding, workspaceRoot: resolve(binding.workspaceRoot) });
  }

  private async bindLocked(
    binding: HookBinding,
    recordFile: string,
  ): Promise<Result<HookBinding, HarnessErrorType>> {
    const normalizedResult = this.normalize(binding);
    if (normalizedResult.status === ResultStatus.Failure) return normalizedResult;
    const normalized = normalizedResult.value;
    const current = await readHookBindingFile(recordFile, this.dependencies.digest);
    if (current.status === ResultStatus.Failure) return current;
    const sameRoot = current.value.filter((candidate) =>
      samePath(candidate.workspaceRoot, normalized.workspaceRoot),
    );
    for (const existing of sameRoot) {
      if (!samePublicIdentity(existing, normalized)) return versionConflict(normalized);
    }
    const sameVersion = sameRoot.find(
      (candidate) => candidate.schemaVersion === normalized.schemaVersion,
    );
    if (sameVersion !== undefined) {
      if (!sameBindingIdentity(sameVersion, normalized)) return versionConflict(normalized);
      const persisted = await this.persistBindings(recordFile, current.value);
      return persisted.status === ResultStatus.Failure ? persisted : success(sameVersion);
    }
    const bindings = [...current.value, normalized].sort(
      (left, right) =>
        left.workspaceRoot.localeCompare(right.workspaceRoot) ||
        left.schemaVersion.localeCompare(right.schemaVersion),
    );
    const persisted = await this.persistBindings(recordFile, bindings);
    return persisted.status === ResultStatus.Failure ? persisted : success(normalized);
  }

  private async persistBindings(
    recordFile: string,
    bindings: readonly HookBinding[],
  ): Promise<Result<void, HarnessErrorType>> {
    try {
      await writeHookBindingFile(recordFile, bindings);
      const directorySync =
        await this.dependencies.parentDirectoryDurability.syncParentDirectory(recordFile);
      if (!isDurableParentDirectorySyncStatus(directorySync.status)) {
        return failure(
          new HarnessError(
            HarnessErrorCode.HookBindingCommitOutcomeUnknown,
            "Hook Binding 父目录未达到受支持的耐久性。",
            {
              recordFile,
              parentDirectorySyncStatus: directorySync.status,
              reason: directorySync.reason ?? "not_reported",
            },
          ),
        );
      }
      return success(undefined);
    } catch (error) {
      return failure(
        error instanceof HarnessError &&
          error.code === HarnessErrorCode.HookBindingCommitOutcomeUnknown
          ? error
          : new HarnessError(
              HarnessErrorCode.HookBindingCommitOutcomeUnknown,
              "Hook Binding 已开始写入但提交结果未知。",
              { recordFile },
              error,
            ),
      );
    }
  }

  private async acquire(
    lockFile: string,
  ): Promise<Result<ExclusiveFileLockHandle, HarnessErrorType>> {
    try {
      return success(
        await this.dependencies.lockManager.acquire(lockFile, { workspaceId: "hook-bindings" }),
      );
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(
              HarnessErrorCode.IoFailure,
              "获取 Hook Binding Lock 失败。",
              { lockFile },
              error,
            ),
      );
    }
  }
}

function samePublicIdentity(left: HookBinding, right: HookBinding): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.taskId === right.taskId &&
    left.planRiskArtifactId === right.planRiskArtifactId &&
    left.planRiskArtifactDigest === right.planRiskArtifactDigest &&
    left.actorId === right.actorId
  );
}

function sameBindingIdentity(left: HookBinding, right: HookBinding): boolean {
  if (left.schemaVersion !== right.schemaVersion || !samePublicIdentity(left, right)) return false;
  if (left.schemaVersion === "1.0.0" || right.schemaVersion === "1.0.0") return true;
  return (
    left.sessionId === right.sessionId &&
    left.codingTaskId === right.codingTaskId &&
    left.attemptNumber === right.attemptNumber &&
    left.worktreeId === right.worktreeId &&
    left.worktreeRootDigest === right.worktreeRootDigest &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest
  );
}

function versionConflict(binding: HookBinding): Result<never, HarnessErrorType> {
  return failure(
    new HarnessError(
      HarnessErrorCode.VersionConflict,
      "同一工作区根目录已经绑定其他身份，不能静默覆盖。",
      { workspaceRoot: binding.workspaceRoot },
    ),
  );
}

function bindingPriority(binding: HookBinding): number {
  return binding.schemaVersion === "2.0.0" ? 1 : 0;
}

function samePath(left: string, right: string): boolean {
  return samePathIdentity(left, right);
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return (
    relativePath.length === 0 ||
    (!isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith("..\\") &&
      !relativePath.startsWith("../"))
  );
}
