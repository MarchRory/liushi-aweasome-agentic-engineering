import { isAbsolute, resolve } from "node:path";

import writeFileAtomic from "write-file-atomic";

import {
  hasSameCodingTaskSessionCloseoutIdentity,
  rebuildCodingTaskSessionCloseoutState,
  validateCodingTaskSessionCloseoutSuccessor,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionCloseoutStateCreateResult,
  CodingTaskSessionCloseoutStateLocator,
  CodingTaskSessionCloseoutStateReplaceInput,
  CodingTaskSessionCloseoutStateStore,
} from "#application/ports/codingTaskSessionCloseoutStateStore/index.js";
import { CodingTaskSessionCloseoutStateCreateDisposition as Disposition } from "#application/ports/codingTaskSessionCloseoutStateStore/index.js";
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
  createOnlyImmutableFile,
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "#infrastructure/immutableFile/index.js";
import {
  type FileLockManager,
  type ParentDirectoryDurability,
} from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type {
  CodingTaskSessionCloseoutStorePaths,
  FileCodingTaskSessionCloseoutStoreDependencies,
} from "../contracts/index.js";
import {
  asCloseoutStateMutationError,
  closeoutStateCommitUnknown,
  closeoutStateNotFound,
} from "../errors/index.js";
import { readCodingTaskSessionCloseoutState } from "../io/index.js";
import { withCodingTaskSessionCloseoutMutationLock } from "../mutation/index.js";
import { resolveCodingTaskSessionCloseoutStorePaths } from "../path/index.js";
import {
  ensureCodingTaskSessionCloseoutStorePath,
  hasSameCanonicalCloseoutState,
  isInitialCloseoutState,
  isCodingTaskSessionCloseoutStatePresent,
  parseCloseoutStateLocator,
} from "../validation/index.js";

/** 使用同一短时 State Lock 实现 create-only 与版本化 replace 的 File Store。 */
export class FileCodingTaskSessionCloseoutStore implements CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState> {
  private readonly storeRoot: string;
  private readonly digest: FileCodingTaskSessionCloseoutStoreDependencies["digest"];
  private readonly lockManager: FileLockManager;
  private readonly parentDirectoryDurability: ParentDirectoryDurability;

  /** 接收 Composition Root 注入的 Digest、锁与目录耐久能力。 */
  public constructor(
    storeRoot: string,
    dependencies: FileCodingTaskSessionCloseoutStoreDependencies,
  ) {
    if (!isAbsolute(storeRoot)) {
      throw new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Closeout Store Root 必须是绝对路径。",
        {
          storeRoot,
        },
      );
    }
    this.storeRoot = resolve(storeRoot);
    this.digest = dependencies.digest;
    this.lockManager = dependencies.lockManager;
    this.parentDirectoryDurability = dependencies.parentDirectoryDurability;
  }

  /** 在短时 State Lock 内执行初始 Closing State 的 create-only 发布。 */
  public async create(
    state: CodingTaskSessionCloseoutState,
  ): Promise<
    Result<CodingTaskSessionCloseoutStateCreateResult<CodingTaskSessionCloseoutState>, HarnessError>
  > {
    const rebuilt = rebuildCodingTaskSessionCloseoutState(state, this.digest);
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    if (!isInitialCloseoutState(rebuilt.value)) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Closeout create 必须是初始 Closing。"),
      );
    }
    const paths = resolveCodingTaskSessionCloseoutStorePaths(
      this.storeRoot,
      rebuilt.value.workspaceId,
      rebuilt.value.sessionId,
    );
    return withCodingTaskSessionCloseoutMutationLock({
      paths,
      createMissing: true,
      lockManager: this.lockManager,
      operation: () => this.createLocked(paths, rebuilt.value),
    });
  }

  /** 读取普通 State 文件，并通过 Application 重建完整状态。 */
  public async load(
    locator: CodingTaskSessionCloseoutStateLocator,
  ): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
    const parsed = parseCloseoutStateLocator(locator);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const paths = resolveCodingTaskSessionCloseoutStorePaths(
      this.storeRoot,
      parsed.value.workspaceId,
      parsed.value.sessionId,
    );
    const prepared = await ensureCodingTaskSessionCloseoutStorePath(paths, false);
    if (prepared.status === ResultStatus.Failure) return prepared;
    if (!prepared.value) return failure(closeoutStateNotFound());
    return readCodingTaskSessionCloseoutState(paths, this.digest);
  }

  /** 在短时 State Lock 内重新读取当前版本并执行原子 CAS replace。 */
  public async replace(
    input: CodingTaskSessionCloseoutStateReplaceInput<CodingTaskSessionCloseoutState>,
  ): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
    if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "expectedVersion 必须是非负安全整数。"),
      );
    }
    const candidate = rebuildCodingTaskSessionCloseoutState(input.state, this.digest);
    if (candidate.status === ResultStatus.Failure) return candidate;
    if (candidate.value.version !== input.expectedVersion + 1) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "候选 Closeout State version 必须递增一位。",
        ),
      );
    }
    const paths = resolveCodingTaskSessionCloseoutStorePaths(
      this.storeRoot,
      candidate.value.workspaceId,
      candidate.value.sessionId,
    );
    return withCodingTaskSessionCloseoutMutationLock({
      paths,
      createMissing: false,
      lockManager: this.lockManager,
      operation: () => this.replaceLocked(paths, input.expectedVersion, candidate.value),
    });
  }

  private async createLocked(
    paths: CodingTaskSessionCloseoutStorePaths,
    state: CodingTaskSessionCloseoutState,
  ): Promise<
    Result<CodingTaskSessionCloseoutStateCreateResult<CodingTaskSessionCloseoutState>, HarnessError>
  > {
    const existing = await isCodingTaskSessionCloseoutStatePresent(paths.stateFile);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value) return this.resolveExisting(paths, state);
    try {
      const disposition = await createOnlyImmutableFile({
        outputFilePath: paths.stateFile,
        content: Buffer.from(`${canonicalizeJson(state)}\n`, "utf8"),
        parentDirectoryDurability: this.parentDirectoryDurability,
        parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
        commitOutcomeUnknownCode: HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown,
        conflictErrorCode: HarnessErrorCode.CorruptStore,
        artifactName: "Closeout State",
      });
      if (disposition === ImmutableFileWriteDisposition.IdempotentReuse) {
        return this.resolveExisting(paths, state);
      }
      const verified = await readCodingTaskSessionCloseoutState(paths, this.digest);
      if (
        verified.status === ResultStatus.Failure ||
        !hasSameCanonicalCloseoutState(verified.value, state)
      ) {
        return failure(
          closeoutStateCommitUnknown(
            paths.stateFile,
            verified.status === ResultStatus.Failure ? verified.error : undefined,
          ),
        );
      }
      return success({ disposition: Disposition.Created, state: verified.value });
    } catch (error) {
      return failure(asCloseoutStateMutationError(error, paths.stateFile, false));
    }
  }

  private async resolveExisting(
    paths: CodingTaskSessionCloseoutStorePaths,
    incoming: CodingTaskSessionCloseoutState,
  ): Promise<
    Result<CodingTaskSessionCloseoutStateCreateResult<CodingTaskSessionCloseoutState>, HarnessError>
  > {
    const existing = await readCodingTaskSessionCloseoutState(paths, this.digest);
    if (existing.status === ResultStatus.Failure) return existing;
    return success({
      disposition: hasSameCodingTaskSessionCloseoutIdentity(existing.value, incoming)
        ? Disposition.Reused
        : Disposition.Conflict,
      state: existing.value,
    });
  }

  private async replaceLocked(
    paths: CodingTaskSessionCloseoutStorePaths,
    expectedVersion: number,
    candidate: CodingTaskSessionCloseoutState,
  ): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
    const current = await readCodingTaskSessionCloseoutState(paths, this.digest);
    if (current.status === ResultStatus.Failure) return current;
    if (current.value.version !== expectedVersion) {
      return failure(
        new HarnessError(HarnessErrorCode.VersionConflict, "Closeout State version 已变化。", {
          expectedVersion: String(expectedVersion),
          actualVersion: String(current.value.version),
        }),
      );
    }
    const successor = validateCodingTaskSessionCloseoutSuccessor(
      current.value,
      candidate,
      this.digest,
    );
    if (successor.status === ResultStatus.Failure) return successor;
    let mutationStarted = false;
    try {
      mutationStarted = true;
      await writeFileAtomic(paths.stateFile, `${canonicalizeJson(successor.value)}\n`, {
        encoding: "utf8",
        fsync: true,
      });
      const directorySync = await this.parentDirectoryDurability.syncParentDirectory(
        paths.stateFile,
      );
      if (!isDurableParentDirectorySyncStatus(directorySync.status)) {
        throw closeoutStateCommitUnknown(paths.stateFile, undefined, directorySync.reason);
      }
      const verified = await readCodingTaskSessionCloseoutState(paths, this.digest);
      if (
        verified.status === ResultStatus.Failure ||
        !hasSameCanonicalCloseoutState(verified.value, successor.value)
      ) {
        throw closeoutStateCommitUnknown(
          paths.stateFile,
          verified.status === ResultStatus.Failure ? verified.error : undefined,
        );
      }
      return success(verified.value);
    } catch (error) {
      return failure(asCloseoutStateMutationError(error, paths.stateFile, mutationStarted));
    }
  }
}
