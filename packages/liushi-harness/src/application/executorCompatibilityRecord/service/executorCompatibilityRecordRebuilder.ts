import type {
  ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
  ExecutorCompatibilityEvidenceStore,
  ExecutorCompatibilityMatrixStore,
} from "#application/ports/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import {
  compileExecutorCompatibilityMatrix,
  createExecutorCompatibilityPolicyDigestInput,
  createManagedFileMutationHookPolicy,
  type ExecutorCapabilityEvidence,
  type ExecutorCompatibilityDigestPort,
} from "#domain/executorCompatibility/index.js";

import type { VerifiedExecutorCompatibilityRecord } from "../contracts/index.js";

/** 可信 Compatibility 记录重建所需的执行器无关依赖。 */
export interface ExecutorCompatibilityRecordRebuildDependencies {
  /** 对完整来源 Projection 集合执行关闭式复验。 */
  readonly verifier: ExecutorCompatibilityEvidenceProjectionSetVerifierPort;
  /** 按 Evidence Digest 恢复来源 Projection。 */
  readonly evidenceStore: ExecutorCompatibilityEvidenceStore;
  /** 按精确 Matrix Digest 恢复 Matrix 与 Policy 记录。 */
  readonly matrixStore: ExecutorCompatibilityMatrixStore;
  /** 计算 Domain 内容摘要。 */
  readonly digestPort: ExecutorCompatibilityDigestPort;
}

/** 从精确 Matrix Digest 重建并重新证明完整 Compatibility 记录。 */
export async function rebuildExecutorCompatibilityRecord(
  matrixDigest: ContentDigest,
  dependencies: ExecutorCompatibilityRecordRebuildDependencies,
): Promise<Result<VerifiedExecutorCompatibilityRecord, HarnessError>> {
  const loadedRecord = await dependencies.matrixStore.load(matrixDigest);
  if (loadedRecord.status === ResultStatus.Failure) return loadedRecord;

  const trustedPolicy = createManagedFileMutationHookPolicy();
  const trustedPolicyDigest = dependencies.digestPort.calculate(
    createExecutorCompatibilityPolicyDigestInput(trustedPolicy),
  );
  if (trustedPolicyDigest.status === ResultStatus.Failure) return trustedPolicyDigest;
  if (trustedPolicyDigest.value !== loadedRecord.value.matrix.policyDigest) {
    return corruptStore("Executor Compatibility Matrix 未绑定当前受信 Policy。", matrixDigest, {
      storedPolicyDigest: loadedRecord.value.matrix.policyDigest,
      trustedPolicyDigest: trustedPolicyDigest.value,
    });
  }

  const loadedProjections = await dependencies.evidenceStore.loadProjections(
    loadedRecord.value.matrix.evidenceDigests,
  );
  if (loadedProjections.status === ResultStatus.Failure) {
    if (loadedProjections.error.code === HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound) {
      const evidenceDigest = loadedProjections.error.details["evidenceDigest"];
      return corruptStore("Executor Compatibility Matrix 引用的 Evidence 不存在。", matrixDigest, {
        causeCode: loadedProjections.error.code,
        ...(evidenceDigest === undefined ? {} : { evidenceDigest }),
      });
    }
    return corruptStore("Executor Compatibility Evidence 来源无法恢复。", matrixDigest, {
      causeCode: loadedProjections.error.code,
    });
  }

  const verifiedProjections = dependencies.verifier.verifyPersistedProjectionSet(
    loadedProjections.value,
  );
  if (verifiedProjections.status === ResultStatus.Failure) {
    return corruptStore(
      "Executor Compatibility 持久化 Projection 集合无法通过确定性复验。",
      matrixDigest,
      { causeCode: verifiedProjections.error.code },
    );
  }
  const verifiedEvidence: ExecutorCapabilityEvidence[] = verifiedProjections.value.flatMap(
    (projection) => projection.evidence,
  );
  const recomputed = compileExecutorCompatibilityMatrix(
    {
      scope: loadedRecord.value.matrix.scope,
      policy: trustedPolicy,
      evidence: verifiedEvidence.sort((left, right) =>
        left.evidenceDigest.localeCompare(right.evidenceDigest),
      ),
    },
    dependencies.digestPort,
  );
  if (recomputed.status === ResultStatus.Failure) {
    return corruptStore("Executor Compatibility 持久化记录无法完成重编译。", matrixDigest, {
      causeCode: recomputed.error.code,
    });
  }

  const storedContentDigest = dependencies.digestPort.calculate(loadedRecord.value.matrix);
  if (storedContentDigest.status === ResultStatus.Failure) return storedContentDigest;
  const recomputedContentDigest = dependencies.digestPort.calculate(recomputed.value);
  if (recomputedContentDigest.status === ResultStatus.Failure) return recomputedContentDigest;
  if (
    loadedRecord.value.matrix.matrixDigest !== matrixDigest ||
    recomputed.value.matrixDigest !== matrixDigest ||
    storedContentDigest.value !== recomputedContentDigest.value
  ) {
    return corruptStore("Executor Compatibility Matrix 与重编译结果不一致。", matrixDigest, {
      storedMatrixDigest: loadedRecord.value.matrix.matrixDigest,
      recomputedMatrixDigest: recomputed.value.matrixDigest,
    });
  }

  return success({
    matrix: recomputed.value,
    policy: trustedPolicy,
    projections: verifiedProjections.value,
  });
}

function corruptStore(
  message: string,
  requestedMatrixDigest: ContentDigest,
  details: Readonly<Record<string, string>>,
): Result<never, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.CorruptStore, message, {
      requestedMatrixDigest,
      ...details,
    }),
  );
}
