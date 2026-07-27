import writeFileAtomic from "write-file-atomic";

import {
  CodingTaskSessionCloseoutRecoveryStateStatus,
  hasSameCodingTaskSessionCloseoutRecoveryIdentity,
  validateCodingTaskSessionCloseoutRecoveryStateSuccessor,
  type CodingTaskSessionCloseoutRecoveryState,
} from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import type { CodingTaskSessionCloseoutRecoveryStateCreateResult } from "#application/ports/codingTaskSessionCloseoutRecoveryStateStore/index.js";
import { CodingTaskSessionCloseoutRecoveryStateCreateDisposition as Disposition } from "#application/ports/codingTaskSessionCloseoutRecoveryStateStore/index.js";
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
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { CodingTaskSessionCloseoutRecoveryStorePaths } from "../contracts/index.js";
import {
  asCodingTaskSessionCloseoutRecoveryMutationError,
  codingTaskSessionCloseoutRecoveryCommitOutcomeUnknown,
} from "../errors/index.js";
import { readCodingTaskSessionCloseoutRecoveryState } from "../io/index.js";
import { isCodingTaskSessionCloseoutRecoveryStatePresent } from "../validation/index.js";

/** 承载 Recovery State 的 create-only 发布与 CAS 原子替换。 */
export class FileCodingTaskSessionCloseoutRecoveryStoreMutationService {
  public constructor(
    private readonly digest: ContentDigestPort,
    private readonly parentDirectoryDurability: ParentDirectoryDurability,
  ) {}

  /** 发布 Approved v0，并在发布后重读验证完整内容。 */
  public async create(
    paths: CodingTaskSessionCloseoutRecoveryStorePaths,
    state: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<
    Result<
      CodingTaskSessionCloseoutRecoveryStateCreateResult<CodingTaskSessionCloseoutRecoveryState>,
      HarnessError
    >
  > {
    const existing = await this.findExisting(paths);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value !== null) return this.resolveExisting(existing.value, state);
    try {
      const disposition = await createOnlyImmutableFile({
        outputFilePath: paths.stateFile,
        content: Buffer.from(`${canonicalizeJson(state)}\n`, "utf8"),
        parentDirectoryDurability: this.parentDirectoryDurability,
        parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
        commitOutcomeUnknownCode:
          HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown,
        conflictErrorCode: HarnessErrorCode.CorruptStore,
        artifactName: "Closeout Recovery State",
      });
      if (disposition === ImmutableFileWriteDisposition.IdempotentReuse) {
        const reused = await readCodingTaskSessionCloseoutRecoveryState(paths, this.digest);
        return reused.status === ResultStatus.Failure
          ? reused
          : this.resolveExisting(reused.value, state);
      }
      const verified = await readCodingTaskSessionCloseoutRecoveryState(paths, this.digest);
      if (
        verified.status === ResultStatus.Failure ||
        !hasSameCanonicalState(verified.value, state)
      ) {
        return failure(
          codingTaskSessionCloseoutRecoveryCommitOutcomeUnknown(
            paths.stateFile,
            verified.status === ResultStatus.Failure ? verified.error : undefined,
          ),
        );
      }
      return success({ disposition: Disposition.Created, state: verified.value });
    } catch (error) {
      return failure(
        asCodingTaskSessionCloseoutRecoveryMutationError(error, paths.stateFile, false),
      );
    }
  }

  /** 在锁内重读 current、校验 successor 并执行原子替换。 */
  public async replace(
    paths: CodingTaskSessionCloseoutRecoveryStorePaths,
    expectedVersion: number,
    candidate: CodingTaskSessionCloseoutRecoveryState,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState, HarnessError>> {
    const current = await readCodingTaskSessionCloseoutRecoveryState(paths, this.digest);
    if (current.status === ResultStatus.Failure) return current;
    if (current.value.version !== expectedVersion) {
      return failure(
        new HarnessError(HarnessErrorCode.VersionConflict, "Recovery State version 已变化。", {
          expectedVersion: String(expectedVersion),
          actualVersion: String(current.value.version),
        }),
      );
    }
    const successor = validateCodingTaskSessionCloseoutRecoveryStateSuccessor(
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
        throw codingTaskSessionCloseoutRecoveryCommitOutcomeUnknown(
          paths.stateFile,
          undefined,
          directorySync.reason,
        );
      }
      const verified = await readCodingTaskSessionCloseoutRecoveryState(paths, this.digest);
      if (
        verified.status === ResultStatus.Failure ||
        !hasSameCanonicalState(verified.value, successor.value)
      ) {
        throw codingTaskSessionCloseoutRecoveryCommitOutcomeUnknown(
          paths.stateFile,
          verified.status === ResultStatus.Failure ? verified.error : undefined,
        );
      }
      return success(verified.value);
    } catch (error) {
      return failure(
        asCodingTaskSessionCloseoutRecoveryMutationError(error, paths.stateFile, mutationStarted),
      );
    }
  }

  private async findExisting(
    paths: CodingTaskSessionCloseoutRecoveryStorePaths,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState | null, HarnessError>> {
    const present = await isCodingTaskSessionCloseoutRecoveryStatePresent(paths.stateFile);
    if (present.status === ResultStatus.Failure) return present;
    if (!present.value) return success(null);
    return readCodingTaskSessionCloseoutRecoveryState(paths, this.digest);
  }

  private resolveExisting(
    existing: CodingTaskSessionCloseoutRecoveryState,
    incoming: CodingTaskSessionCloseoutRecoveryState,
  ): Result<
    CodingTaskSessionCloseoutRecoveryStateCreateResult<CodingTaskSessionCloseoutRecoveryState>,
    HarnessError
  > {
    return success({
      disposition: hasSameCodingTaskSessionCloseoutRecoveryIdentity(existing, incoming)
        ? Disposition.Reused
        : Disposition.Conflict,
      state: existing,
    });
  }
}

function hasSameCanonicalState(
  left: CodingTaskSessionCloseoutRecoveryState,
  right: CodingTaskSessionCloseoutRecoveryState,
): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

/** 只允许 Approved v0 作为 Recovery Store 的首条记录。 */
export function isApprovedInitialRecoveryState(
  state: CodingTaskSessionCloseoutRecoveryState,
): boolean {
  return (
    state.status === CodingTaskSessionCloseoutRecoveryStateStatus.Approved &&
    state.version === 0 &&
    state.updatedAt === state.createdAt &&
    state.checkpoint === null &&
    state.errorCode === null &&
    state.recoveryGuidance === null
  );
}
