import { isAbsolute, resolve } from "node:path";

import type {
  CodingTaskSessionActivationCreateResult,
  CodingTaskSessionActivationLocator,
  CodingTaskSessionActivationRepository,
} from "#application/ports/codingTaskSessionActivationRepository/index.js";
import { CodingTaskSessionActivationDisposition as Disposition } from "#application/ports/codingTaskSessionActivationRepository/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  rebuildCodingTaskSessionActivationRecord,
  parseCodingTaskSessionId,
  type CodingTaskSessionActivationRecord,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import {
  createOnlyImmutableFile,
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "#infrastructure/immutableFile/index.js";
import {
  type ExclusiveFileLockHandle,
  type FileLockManager,
  type ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type {
  CodingTaskSessionActivationStorePaths,
  FileCodingTaskSessionActivationRepositoryDependencies,
} from "../contracts/index.js";
import { readCodingTaskSessionActivationRecord } from "../io/index.js";
import { resolveCodingTaskSessionActivationStorePaths } from "../path/index.js";
import { acquireCodingTaskSessionActivationLockWithRetry } from "../utils/index.js";
import {
  ensureCodingTaskSessionActivationStorePath,
  isCodingTaskSessionActivationRecordPresent,
} from "../validation/index.js";

/** 基于严格 canonical JSON 的不可变 File CodingTask Session Activation Repository。 */
export class FileCodingTaskSessionActivationRepository implements CodingTaskSessionActivationRepository {
  private readonly storeRoot: string;
  private readonly digest: ContentDigestPort;
  private readonly lockManager: FileLockManager;
  private readonly parentDirectoryDurability: ParentDirectoryDurability;

  /** 仅接收 Composition Root 注入的基础设施依赖。 */
  public constructor(
    storeRoot: string,
    dependencies: FileCodingTaskSessionActivationRepositoryDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Activation Store Root 必须是绝对路径。",
      );
    }
    this.storeRoot = resolve(storeRoot);
    this.digest = dependencies.digest;
    this.lockManager = dependencies.lockManager;
    this.parentDirectoryDurability = dependencies.parentDirectoryDurability;
  }

  /** 严格校验后在 Session 锁内 create-only 原子发布 Activation Record。 */
  public async create(
    record: CodingTaskSessionActivationRecord,
  ): Promise<Result<CodingTaskSessionActivationCreateResult, HarnessError>> {
    const rebuilt = rebuildCodingTaskSessionActivationRecord(record, this.digest);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    const paths = resolveCodingTaskSessionActivationStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    return this.withLock(paths, true, () => this.createLocked(paths, rebuilt.value));
  }

  /** 在 Session 锁内读取 canonical JSON，并重新进行领域重建与 Digest 复验。 */
  public async load(
    locator: CodingTaskSessionActivationLocator,
  ): Promise<Result<CodingTaskSessionActivationRecord, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveCodingTaskSessionActivationStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    const prepared = await ensureCodingTaskSessionActivationStorePath(paths, false);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());
    return this.withLock(paths, false, () =>
      readCodingTaskSessionActivationRecord(paths.recordFile, this.digest),
    );
  }

  private async createLocked(
    paths: CodingTaskSessionActivationStorePaths,
    record: CodingTaskSessionActivationRecord,
  ): Promise<Result<CodingTaskSessionActivationCreateResult, HarnessError>> {
    const existing = await isCodingTaskSessionActivationRecordPresent(paths.recordFile);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value) return this.resolveExisting(paths, record);

    const content = Buffer.from(`${canonicalizeJson(record)}\n`, "utf8");
    try {
      const disposition = await createOnlyImmutableFile({
        outputFilePath: paths.recordFile,
        content,
        parentDirectoryDurability: this.parentDirectoryDurability,
        parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
        commitOutcomeUnknownCode: HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown,
        conflictErrorCode: HarnessErrorCode.CorruptStore,
        artifactName: "CodingTask Session Activation Record",
      });
      if (disposition === ImmutableFileWriteDisposition.Created) {
        return success({ disposition: Disposition.Created, record });
      }
      return this.resolveExisting(paths, record);
    } catch (error) {
      if (error instanceof HarnessError) return failure(error);
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Activation Record 原子写入失败。"),
      );
    }
  }

  private async resolveExisting(
    paths: CodingTaskSessionActivationStorePaths,
    incoming: CodingTaskSessionActivationRecord,
  ): Promise<Result<CodingTaskSessionActivationCreateResult, HarnessError>> {
    const existing = await readCodingTaskSessionActivationRecord(paths.recordFile, this.digest);
    if (existing.status === ResultStatus.Failure) return existing;
    const same = canonicalizeJson(existing.value) === canonicalizeJson(incoming);
    return success({
      disposition: same ? Disposition.Reused : Disposition.Conflict,
      record: existing.value,
    });
  }

  private async withLock<T>(
    paths: CodingTaskSessionActivationStorePaths,
    createMissing: boolean,
    operation: () => Promise<Result<T, HarnessError>>,
  ): Promise<Result<T, HarnessError>> {
    const prepared = await ensureCodingTaskSessionActivationStorePath(paths, createMissing);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());

    let lock: ExclusiveFileLockHandle;
    try {
      lock = await acquireCodingTaskSessionActivationLockWithRetry(this.lockManager, paths);
    } catch (error) {
      if (error instanceof HarnessError) return failure(error);
      return failure(
        new HarnessError(HarnessErrorCode.LockUnavailable, "Activation Record Lock 不可用。"),
      );
    }
    let result: Result<T, HarnessError>;
    try {
      const rechecked = await ensureCodingTaskSessionActivationStorePath(paths, createMissing);
      result =
        rechecked.status === ResultStatus.Failure
          ? rechecked
          : !rechecked.value
            ? failure(notFound())
            : await operation();
    } catch (error) {
      if (error instanceof HarnessError) {
        result = failure(error);
      } else {
        result = failure(
          new HarnessError(
            HarnessErrorCode.IoFailure,
            "Activation Repository 操作失败。",
            {},
            error,
          ),
        );
      }
    }
    try {
      await lock.release();
    } catch (error) {
      if (error instanceof HarnessError) return failure(error);
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Activation Record Lock 释放失败。"),
      );
    }
    return result;
  }
}

function parseLocator(
  locator: CodingTaskSessionActivationLocator,
): Result<
  { readonly workspaceId: WorkspaceId; readonly sessionId: CodingTaskSessionId },
  HarnessError
> {
  const workspaceId = parseWorkspaceId(String(locator?.workspaceId ?? ""));
  if (workspaceId.status === ResultStatus.Failure) return workspaceId;
  const sessionId = parseCodingTaskSessionId(String(locator?.sessionId ?? ""));
  if (sessionId.status === ResultStatus.Failure) return sessionId;
  return success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}

function notFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, "Activation Record 不存在。");
}
