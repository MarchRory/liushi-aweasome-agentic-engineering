import { isAbsolute, resolve } from "node:path";
import writeFileAtomic from "write-file-atomic";

import type {
  CodingTaskSessionAdmissionStateCreateResult,
  CodingTaskSessionAdmissionStateLocator,
  CodingTaskSessionAdmissionStateReplaceInput,
  CodingTaskSessionAdmissionStateStore,
} from "#application/ports/codingTaskSessionAdmissionStateStore/index.js";
import { CodingTaskSessionAdmissionStateCreateDisposition as Disposition } from "#application/ports/codingTaskSessionAdmissionStateStore/index.js";
import { isDurableParentDirectorySyncStatus } from "#application/ports/taskRepository/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskSessionAdmissionStatus,
  rebuildCodingTaskSessionAdmissionState,
  parseCodingTaskSessionId,
  type CodingTaskSessionAdmissionState,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import {
  createOnlyImmutableFile,
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "#infrastructure/immutableFile/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type { FileCodingTaskSessionAdmissionStateStoreDependencies } from "../contracts/index.js";
import { readCodingTaskSessionAdmissionState } from "../io/index.js";
import { resolveCodingTaskSessionAdmissionStorePaths } from "../path/index.js";
import {
  ensureCodingTaskSessionAdmissionStorePath,
  isCodingTaskSessionAdmissionStatePresent,
} from "../validation/index.js";

/** 使用 admission.json 实现严格 create-only 与原子版本替换的 Admission State Store。 */
export class FileCodingTaskSessionAdmissionStateStore implements CodingTaskSessionAdmissionStateStore {
  private readonly storeRoot: string;
  private readonly parentDirectoryDurability: ParentDirectoryDurability;

  /** 仅接收 Composition Root 注入的基础设施依赖。 */
  public constructor(
    storeRoot: string,
    dependencies: FileCodingTaskSessionAdmissionStateStoreDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(HarnessErrorCode.InvalidInput, "Admission Store Root 必须是绝对路径");
    }
    this.storeRoot = resolve(storeRoot);
    this.parentDirectoryDurability = dependencies.parentDirectoryDurability;
  }

  /** 仅创建初始 waiting_agent 文件；同内容复用，不同内容冲突。 */
  public async create(
    state: CodingTaskSessionAdmissionState,
  ): Promise<Result<CodingTaskSessionAdmissionStateCreateResult, HarnessError>> {
    const rebuilt = rebuildCodingTaskSessionAdmissionState(state);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    if (!isInitialState(rebuilt.value)) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Admission State create 必须是初始状态"),
      );
    }
    const paths = resolveCodingTaskSessionAdmissionStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    const prepared = await ensureCodingTaskSessionAdmissionStorePath(paths, true);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());
    const existing = await isCodingTaskSessionAdmissionStatePresent(paths.stateFile);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value) return this.resolveExisting(paths.stateFile, rebuilt.value);

    try {
      const disposition = await createOnlyImmutableFile({
        outputFilePath: paths.stateFile,
        content: Buffer.from(`${canonicalizeJson(rebuilt.value)}\n`, "utf8"),
        parentDirectoryDurability: this.parentDirectoryDurability,
        parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
        commitOutcomeUnknownCode: HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
        conflictErrorCode: HarnessErrorCode.CorruptStore,
        artifactName: "Admission State",
      });
      if (disposition === ImmutableFileWriteDisposition.Created) {
        return success({ disposition: Disposition.Created, state: rebuilt.value });
      }
      return this.resolveExisting(paths.stateFile, rebuilt.value);
    } catch (error) {
      return failure(
        error instanceof HarnessError
          ? error
          : new HarnessError(HarnessErrorCode.IoFailure, "Admission State create 失败", {}, error),
      );
    }
  }

  /** 加载并严格重建 Admission State。 */
  public async load(
    locator: CodingTaskSessionAdmissionStateLocator,
  ): Promise<Result<CodingTaskSessionAdmissionState, HarnessError>> {
    const parsed = parseLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveCodingTaskSessionAdmissionStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    const prepared = await ensureCodingTaskSessionAdmissionStorePath(paths, false);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());
    return readCodingTaskSessionAdmissionState(paths.stateFile);
  }

  /** 在 expectedVersion 匹配时以 fsync 原子替换 Admission State。 */
  public async replace(
    input: CodingTaskSessionAdmissionStateReplaceInput,
  ): Promise<Result<CodingTaskSessionAdmissionState, HarnessError>> {
    if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "expectedVersion 必须是非负安全整数"),
      );
    }
    const candidate = rebuildCodingTaskSessionAdmissionState(input.state);
    if (candidate.status === ResultStatus.Failure) return candidate;
    if (candidate.value.version !== input.expectedVersion + 1) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "候选 Admission State version 必须递增一位",
        ),
      );
    }
    const paths = resolveCodingTaskSessionAdmissionStorePaths(
      this.storeRoot,
      candidate.value.workspaceId,
      candidate.value.sessionId,
    );
    const prepared = await ensureCodingTaskSessionAdmissionStorePath(paths, false);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(notFound());
    const current = await readCodingTaskSessionAdmissionState(paths.stateFile);
    if (current.status === ResultStatus.Failure) return current;
    if (current.value.version !== input.expectedVersion) {
      return failure(versionConflict(input.expectedVersion, current.value.version));
    }
    if (!sameIdentity(current.value, candidate.value)) {
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Admission State 绑定身份不可变"),
      );
    }
    let mutationStarted = false;
    try {
      mutationStarted = true;
      await writeFileAtomic(paths.stateFile, `${canonicalizeJson(candidate.value)}\n`, {
        encoding: "utf8",
        fsync: true,
      });
      const directorySync = await this.parentDirectoryDurability.syncParentDirectory(
        paths.stateFile,
      );
      if (!isDurableParentDirectorySyncStatus(directorySync.status)) {
        throw new HarnessError(
          HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
          "Admission State 父目录未达到受支持的耐久性。",
          {
            outputFilePath: paths.stateFile,
            parentDirectorySyncStatus: directorySync.status,
            reason: directorySync.reason ?? "not_reported",
          },
        );
      }
      const verified = await readCodingTaskSessionAdmissionState(paths.stateFile);
      if (
        verified.status === ResultStatus.Failure ||
        canonicalizeJson(verified.value) !== canonicalizeJson(candidate.value)
      ) {
        throw new Error("Admission State 原子替换后的后置校验失败");
      }
      return success(candidate.value);
    } catch (error) {
      return failure(
        error instanceof HarnessError &&
          error.code === HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown
          ? error
          : mutationStarted
            ? new HarnessError(
                HarnessErrorCode.CodingTaskSessionAdmissionCommitOutcomeUnknown,
                "Admission State 已开始写入但持久化结果未知，禁止自动重试",
                { outputFilePath: paths.stateFile },
                error,
              )
            : new HarnessError(
                HarnessErrorCode.IoFailure,
                "Admission State replace 失败",
                {},
                error,
              ),
      );
    }
  }

  private async resolveExisting(
    stateFile: string,
    incoming: CodingTaskSessionAdmissionState,
  ): Promise<Result<CodingTaskSessionAdmissionStateCreateResult, HarnessError>> {
    const existing = await readCodingTaskSessionAdmissionState(stateFile);
    if (existing.status === ResultStatus.Failure) return existing;
    const same = canonicalizeJson(existing.value) === canonicalizeJson(incoming);
    return success({
      disposition: same ? Disposition.Reused : Disposition.Conflict,
      state: existing.value,
    });
  }
}

function parseLocator(
  locator: CodingTaskSessionAdmissionStateLocator,
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

function isInitialState(state: CodingTaskSessionAdmissionState): boolean {
  return (
    state.status === CodingTaskSessionAdmissionStatus.WaitingAgent &&
    state.pendingAdmission === null &&
    state.admittedActionIds.length === 0 &&
    state.claimedExecutorSessionIdDigest === null &&
    state.version === 0
  );
}

function sameIdentity(
  left: CodingTaskSessionAdmissionState,
  right: CodingTaskSessionAdmissionState,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.workspaceId === right.workspaceId &&
    left.sessionId === right.sessionId &&
    left.activationBindingDigest === right.activationBindingDigest &&
    left.sessionBindingDigest === right.sessionBindingDigest
  );
}

function notFound(): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, "Admission State 不存在");
}

function versionConflict(expectedVersion: number, actualVersion: number): HarnessError {
  return new HarnessError(HarnessErrorCode.VersionConflict, "Admission State version 已变化", {
    expectedVersion: String(expectedVersion),
    actualVersion: String(actualVersion),
  });
}
