import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import writeFileAtomic from "write-file-atomic";

import type { ContentDigestPort, InstallPlanStore } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { InstallPlan, InstallPlanId } from "#domain/installation/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";
import type {
  FileLockManager,
  ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
import {
  hasSymbolicLinkBetween,
  pathContains,
  pathsOverlap,
  resolveCanonicalPathIdentity,
} from "#infrastructure/system/platformCompatibility/index.js";

import { readInstallPlanRecord } from "./io/index.js";
import { resolveInstallPlanStorePaths } from "./path/index.js";
import { verifyInstallPlanIntegrity } from "./validation/index.js";

/** 使用原子文件、排他锁和目录耐久性实现不可变 InstallPlan Store。 */
export class FileInstallPlanStore implements InstallPlanStore {
  /** 注入运行时根目录与既有持久化基础设施。 */
  public constructor(
    private readonly storeRoot: string,
    private readonly dependencies: {
      readonly lockManager: FileLockManager;
      readonly parentDirectoryDurability: ParentDirectoryDurability;
      readonly digest: ContentDigestPort;
    },
  ) {}

  /** 在任何写入前拒绝 Runtime Store 与 Repository 的路径重叠。 */
  public async validateRepositoryIsolation(
    repositoryRoot: string,
  ): Promise<Result<void, HarnessErrorType>> {
    try {
      const [canonicalStoreRoot, canonicalRepositoryRoot] = await Promise.all([
        resolveCanonicalPathIdentity(this.storeRoot),
        resolveCanonicalPathIdentity(repositoryRoot),
      ]);
      return pathsOverlap(canonicalStoreRoot, canonicalRepositoryRoot)
        ? failure(
            new HarnessError(
              HarnessErrorCode.OperationForbidden,
              "Runtime Store must be isolated from the Repository root.",
            ),
          )
        : success(undefined);
    } catch (error) {
      return failure(asError(error, "Unable to validate Runtime Store isolation."));
    }
  }

  /** 相同内容幂等复用；同 ID 的不同内容返回 VersionConflict。 */
  public async save(plan: InstallPlan): Promise<Result<InstallPlan, HarnessErrorType>> {
    const verified = verifyInstallPlanIntegrity(plan, this.dependencies.digest);
    if (verified.status === ResultStatus.Failure) return verified;
    const paths = resolveInstallPlanStorePaths(
      this.storeRoot,
      verified.value.workspaceId,
      verified.value.planId,
    );
    const isolation = await this.validateWriteIsolation(verified.value.root, paths);
    if (isolation.status === ResultStatus.Failure) return isolation;
    let lock;
    try {
      lock = await this.dependencies.lockManager.acquire(paths.lockFile, {
        workspaceId: verified.value.workspaceId,
        taskId: verified.value.planId,
      });
    } catch (error) {
      return failure(asError(error, "Unable to acquire InstallPlan lock."));
    }

    let outcome: Result<InstallPlan, HarnessErrorType>;
    try {
      const existing = await readInstallPlanRecord(paths.recordFile);
      outcome =
        existing === undefined
          ? await this.writeNewPlan(paths.recordFile, verified.value)
          : await this.reuseExistingPlan(paths.recordFile, existing, verified.value);
    } catch (error) {
      outcome = failure(asError(error, "Unable to persist InstallPlan."));
    }
    try {
      await lock.release();
    } catch (error) {
      return failure(asError(error, "Unable to release InstallPlan lock."));
    }
    return outcome;
  }

  /** 从受限派生路径加载，并验证 schema、身份和摘要。 */
  public async load(
    workspaceId: WorkspaceId,
    planId: InstallPlanId,
  ): Promise<Result<InstallPlan, HarnessErrorType>> {
    const paths = resolveInstallPlanStorePaths(this.storeRoot, workspaceId, planId);
    try {
      const raw = await readInstallPlanRecord(paths.recordFile);
      if (raw === undefined)
        return failure(
          new HarnessError(HarnessErrorCode.InvalidInput, "InstallPlan does not exist.", {
            planId,
          }),
        );
      const parsed = verifyInstallPlanIntegrity(raw, this.dependencies.digest);
      if (parsed.status === ResultStatus.Failure) return parsed;
      return parsed.value.workspaceId === workspaceId && parsed.value.planId === planId
        ? parsed
        : failure(
            new HarnessError(
              HarnessErrorCode.CorruptStore,
              "InstallPlan path identity does not match record.",
            ),
          );
    } catch (error) {
      return failure(asError(error, "Unable to load InstallPlan."));
    }
  }

  private async writeNewPlan(
    recordFile: string,
    plan: InstallPlan,
  ): Promise<Result<InstallPlan, HarnessErrorType>> {
    await mkdir(dirname(recordFile), { recursive: true });
    await writeFileAtomic(recordFile, `${JSON.stringify(plan)}\n`, {
      encoding: "utf8",
      fsync: true,
      mode: 0o600,
    });
    await this.dependencies.parentDirectoryDurability.syncParentDirectory(recordFile);
    return success(plan);
  }

  private async reuseExistingPlan(
    recordFile: string,
    existing: unknown,
    requested: InstallPlan,
  ): Promise<Result<InstallPlan, HarnessErrorType>> {
    const valid = verifyInstallPlanIntegrity(existing, this.dependencies.digest);
    if (valid.status === ResultStatus.Failure) return valid;
    await this.dependencies.parentDirectoryDurability.syncParentDirectory(recordFile);
    return valid.value.planDigest === requested.planDigest
      ? success(valid.value)
      : failure(
          new HarnessError(
            HarnessErrorCode.VersionConflict,
            "InstallPlan ID already stores different content.",
            { planId: requested.planId },
          ),
        );
  }

  private async validateWriteIsolation(
    repositoryRoot: string,
    paths: { readonly recordFile: string; readonly lockFile: string },
  ): Promise<Result<void, HarnessErrorType>> {
    const repositoryIsolation = await this.validateRepositoryIsolation(repositoryRoot);
    if (repositoryIsolation.status === ResultStatus.Failure) return repositoryIsolation;
    try {
      const [canonicalStoreRoot, canonicalRepositoryRoot] = await Promise.all([
        resolveCanonicalPathIdentity(this.storeRoot),
        resolveCanonicalPathIdentity(repositoryRoot),
      ]);
      for (const candidate of [paths.lockFile, paths.recordFile]) {
        const canonicalCandidate = await resolveCanonicalPathIdentity(candidate);
        if (
          (await hasSymbolicLinkBetween(this.storeRoot, candidate)) ||
          !pathContains(canonicalStoreRoot, canonicalCandidate) ||
          pathsOverlap(canonicalCandidate, canonicalRepositoryRoot)
        )
          return failure(
            new HarnessError(
              HarnessErrorCode.OperationForbidden,
              "InstallPlan derived paths must remain inside the isolated Runtime Store.",
            ),
          );
      }
      return success(undefined);
    } catch (error) {
      return failure(asError(error, "Unable to validate InstallPlan derived paths."));
    }
  }
}

function asError(error: unknown, message: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, error);
}
