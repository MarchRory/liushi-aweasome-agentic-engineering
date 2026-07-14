import { isAbsolute, relative, resolve } from "node:path";

import type { HookBindingStore, HookWorkspaceBinding } from "#application/index.js";
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
  ): Promise<Result<HookWorkspaceBinding, HarnessErrorType>> {
    const paths = resolveHookBindingStorePaths(this.storeRoot);
    const lock = await this.acquire(paths.lockFile);
    if (lock.status === ResultStatus.Failure) return lock;
    try {
      const current = await readHookBindingFile(paths.recordFile);
      if (current.status === ResultStatus.Failure) return current;
      const normalized = normalizeBinding(binding);
      const existing = current.value.find((candidate) =>
        samePath(candidate.workspaceRoot, normalized.workspaceRoot),
      );
      if (existing !== undefined) {
        if (sameBindingIdentity(existing, normalized)) return success(existing);
        return failure(
          new HarnessError(
            HarnessErrorCode.VersionConflict,
            "同一工作区根目录已经绑定其他 Task 或 PlanRisk，不能静默覆盖。",
            { workspaceRoot: normalized.workspaceRoot },
          ),
        );
      }
      const bindings = [...current.value, normalized].sort((left, right) =>
        left.workspaceRoot.localeCompare(right.workspaceRoot),
      );
      await writeHookBindingFile(paths.recordFile, bindings);
      await this.dependencies.parentDirectoryDurability.syncParentDirectory(paths.recordFile);
      return success(normalized);
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "写入 Hook Binding 文件失败。",
          { recordFile: paths.recordFile },
          error,
        ),
      );
    } finally {
      await releaseBestEffort(lock.value);
    }
  }

  /** 查询当前 cwd 的最长祖先路径绑定。 */
  public async find(cwd: string): Promise<Result<HookWorkspaceBinding, HarnessErrorType>> {
    const paths = resolveHookBindingStorePaths(this.storeRoot);
    const current = await readHookBindingFile(paths.recordFile);
    if (current.status === ResultStatus.Failure) return current;
    const normalizedCwd = resolve(cwd);
    const matches = current.value.filter((binding) =>
      isWithin(binding.workspaceRoot, normalizedCwd),
    );
    const match = matches.sort(
      (left, right) => right.workspaceRoot.length - left.workspaceRoot.length,
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

function normalizeBinding(binding: HookWorkspaceBinding): HookWorkspaceBinding {
  return { ...binding, workspaceRoot: resolve(binding.workspaceRoot) };
}

function sameBindingIdentity(left: HookWorkspaceBinding, right: HookWorkspaceBinding): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.taskId === right.taskId &&
    left.planRiskArtifactId === right.planRiskArtifactId &&
    left.planRiskArtifactDigest === right.planRiskArtifactDigest &&
    left.actorId === right.actorId
  );
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

async function releaseBestEffort(lock: ExclusiveFileLockHandle): Promise<void> {
  try {
    await lock.release();
  } catch {
    // Lock 释放失败由下一次 Doctor/Repair 处理，不能覆盖主操作结果。
  }
}
