import {
  CodingTaskSessionCloseoutRecoveryStateStatus,
  type CodingTaskSessionCloseoutRecoveryState,
} from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import {
  CodingTaskSessionCloseoutStatus,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryStateLocator,
  CodingTaskSessionCloseoutStateLocator,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import {
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
  CodingTaskSessionEffectiveCloseoutUnresolvedReason,
} from "../enums/index.js";
import type {
  CodingTaskSessionEffectiveCloseoutResolution,
  CodingTaskSessionEffectiveCloseoutResolverDependencies,
  CodingTaskSessionEffectiveCloseoutResolverPort,
} from "../contracts/index.js";
import {
  findCheckpointBindingMismatch,
  findCloseoutBindingMismatch,
  findIdentityMismatch,
  findSnapshotBindingMismatch,
} from "../binding/index.js";
import { parseCodingTaskSessionEffectiveCloseoutResolverInput } from "../validation/index.js";

/** 只读解析原 Closeout 或已绑定 Recovery Checkpoint 的 Application Service。 */
export class CodingTaskSessionEffectiveCloseoutResolver implements CodingTaskSessionEffectiveCloseoutResolverPort {
  public constructor(
    private readonly dependencies: CodingTaskSessionEffectiveCloseoutResolverDependencies,
  ) {}

  /** 严格解析输入，并在所有跨模型绑定通过后返回 Effective Closeout。 */
  public async resolve(
    input: unknown,
  ): Promise<Result<CodingTaskSessionEffectiveCloseoutResolution, HarnessError>> {
    const locator = parseCodingTaskSessionEffectiveCloseoutResolverInput(input);
    if (locator.status === ResultStatus.Failure) return locator;

    const closeout = await this.loadCloseout(locator.value);
    if (closeout.status === ResultStatus.Failure) return closeout;
    if (closeout.value.status === CodingTaskSessionCloseoutStatus.CheckpointBound) {
      if (closeout.value.checkpoint === null) {
        return corruptStore(
          "原 Closeout State 违反 CheckpointBound 必须携带 Checkpoint 的 Store 契约。",
        );
      }
      return success({
        status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
        source: CodingTaskSessionEffectiveCloseoutSource.Original,
        checkpoint: closeout.value.checkpoint,
      });
    }
    if (
      closeout.value.status !== CodingTaskSessionCloseoutStatus.Blocked &&
      closeout.value.status !== CodingTaskSessionCloseoutStatus.OutcomeUnknown
    ) {
      return unresolved(CodingTaskSessionEffectiveCloseoutUnresolvedReason.CloseoutNotTerminal);
    }

    const recovery = await this.findRecovery(locator.value);
    if (recovery.status === ResultStatus.Failure) return recovery;
    if (recovery.value === null) {
      return unresolved(CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryMissing);
    }
    switch (recovery.value.status) {
      case CodingTaskSessionCloseoutRecoveryStateStatus.Approved:
      case CodingTaskSessionCloseoutRecoveryStateStatus.Executing:
        return unresolved(CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryNonTerminal);
      case CodingTaskSessionCloseoutRecoveryStateStatus.RetryNotApplied:
      case CodingTaskSessionCloseoutRecoveryStateStatus.OutcomeUnknown:
      case CodingTaskSessionCloseoutRecoveryStateStatus.HumanRequired:
        return unresolved(
          CodingTaskSessionEffectiveCloseoutUnresolvedReason.RecoveryCheckpointUnavailable,
        );
      case CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound:
        return this.resolveBoundRecovery(closeout.value, recovery.value);
      default:
        return corruptStore("Recovery State 包含未知状态。");
    }
  }

  private async loadCloseout(
    locator: CodingTaskSessionCloseoutStateLocator,
  ): Promise<Result<CodingTaskSessionCloseoutState, HarnessError>> {
    try {
      return await this.dependencies.closeoutStateStore.load(locator);
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "原 Closeout State 加载抛出异常。", {}, error),
      );
    }
  }

  private async findRecovery(
    locator: CodingTaskSessionCloseoutRecoveryStateLocator,
  ): Promise<Result<CodingTaskSessionCloseoutRecoveryState | null, HarnessError>> {
    try {
      return await this.dependencies.recoveryStateStore.find(locator);
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Recovery State 查询抛出异常。", {}, error),
      );
    }
  }

  private resolveBoundRecovery(
    closeout: CodingTaskSessionCloseoutState,
    recovery: CodingTaskSessionCloseoutRecoveryState,
  ): Result<CodingTaskSessionEffectiveCloseoutResolution, HarnessError> {
    if (recovery.checkpoint === null) {
      return corruptStore(
        "Recovery State 违反 CheckpointBound 必须携带 Checkpoint 的 Store 契约。",
      );
    }
    const identityMismatch = findIdentityMismatch(closeout, recovery);
    if (identityMismatch !== null) return unresolved(identityMismatch);
    if (closeout.version !== recovery.closeoutVersion) {
      return unresolved(CodingTaskSessionEffectiveCloseoutUnresolvedReason.CloseoutBindingMismatch);
    }

    let digest: Result<ContentDigest, HarnessError>;
    try {
      digest = this.dependencies.digest.calculate(closeout);
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "原 Closeout State Digest 计算抛出异常。",
          {},
          error,
        ),
      );
    }
    if (digest.status === ResultStatus.Failure) return digest;

    const closeoutBindingMismatch = findCloseoutBindingMismatch(closeout, recovery, digest.value);
    if (closeoutBindingMismatch !== null) return unresolved(closeoutBindingMismatch);
    const snapshotBindingMismatch = findSnapshotBindingMismatch(closeout, recovery);
    if (snapshotBindingMismatch !== null) return unresolved(snapshotBindingMismatch);
    const checkpointBindingMismatch = findCheckpointBindingMismatch(closeout, recovery);
    if (checkpointBindingMismatch !== null) return unresolved(checkpointBindingMismatch);

    return success({
      status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
      source: CodingTaskSessionEffectiveCloseoutSource.Recovery,
      checkpoint: recovery.checkpoint,
    });
  }
}

function unresolved(
  reason: CodingTaskSessionEffectiveCloseoutUnresolvedReason,
): Result<CodingTaskSessionEffectiveCloseoutResolution, HarnessError> {
  return success({ status: CodingTaskSessionEffectiveCloseoutStatus.Unresolved, reason });
}

function corruptStore(
  message: string,
): Result<CodingTaskSessionEffectiveCloseoutResolution, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message));
}
