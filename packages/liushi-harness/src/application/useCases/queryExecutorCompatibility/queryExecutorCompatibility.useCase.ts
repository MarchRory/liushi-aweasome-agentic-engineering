import type {
  ExecutorCompatibilityEvidenceProjectionVerifierPort,
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
  type ExecutorCompatibilityMatrix,
} from "#domain/executorCompatibility/index.js";

/** 经完整重编译确认可信的 Executor Compatibility 查询结果。 */
export interface QueryExecutorCompatibilityOutput {
  /** 从源码固定 Policy 与确定性复验 Evidence 重编译得到的 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 标记返回值来自本次完整重编译。 */
  readonly recomputed: true;
}

/** 按来自受信编译边界的精确 Matrix Digest 读取并重新证明内容完整性。 */
export class QueryExecutorCompatibilityUseCase {
  public constructor(
    private readonly verifier: ExecutorCompatibilityEvidenceProjectionVerifierPort,
    private readonly evidenceStore: ExecutorCompatibilityEvidenceStore,
    private readonly matrixStore: ExecutorCompatibilityMatrixStore,
    private readonly digestPort: ExecutorCompatibilityDigestPort,
  ) {}

  /** 锚定源码 Policy，重新投影 Evidence，并拒绝任何持久化内容漂移。 */
  public async execute(
    matrixDigest: ContentDigest,
  ): Promise<Result<QueryExecutorCompatibilityOutput, HarnessError>> {
    const loadedRecord = await this.matrixStore.load(matrixDigest);
    if (loadedRecord.status === ResultStatus.Failure) return loadedRecord;

    const trustedPolicy = createManagedFileMutationHookPolicy();
    const trustedPolicyDigest = this.digestPort.calculate(
      createExecutorCompatibilityPolicyDigestInput(trustedPolicy),
    );
    if (trustedPolicyDigest.status === ResultStatus.Failure) return trustedPolicyDigest;
    if (trustedPolicyDigest.value !== loadedRecord.value.matrix.policyDigest) {
      return corruptStore("Executor Compatibility Matrix 未绑定当前受信 Policy。", matrixDigest, {
        storedPolicyDigest: loadedRecord.value.matrix.policyDigest,
        trustedPolicyDigest: trustedPolicyDigest.value,
      });
    }

    const loadedProjections = await this.evidenceStore.loadProjections(
      loadedRecord.value.matrix.evidenceDigests,
    );
    if (loadedProjections.status === ResultStatus.Failure) {
      if (loadedProjections.error.code === HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound) {
        const evidenceDigest = loadedProjections.error.details["evidenceDigest"];
        return corruptStore(
          "Executor Compatibility Matrix 引用的 Evidence 不存在。",
          matrixDigest,
          {
            causeCode: loadedProjections.error.code,
            ...(evidenceDigest === undefined ? {} : { evidenceDigest }),
          },
        );
      }
      return corruptStore("Executor Compatibility Evidence 来源无法恢复。", matrixDigest, {
        causeCode: loadedProjections.error.code,
      });
    }

    const verifiedEvidence: ExecutorCapabilityEvidence[] = [];
    for (const projection of loadedProjections.value) {
      const verifiedProjection = this.verifier.verifyPersistedProjection(projection);
      if (verifiedProjection.status === ResultStatus.Failure) {
        return corruptStore(
          "Executor Compatibility 持久化 Projection 无法通过确定性复验。",
          matrixDigest,
          { causeCode: verifiedProjection.error.code },
        );
      }
      verifiedEvidence.push(...verifiedProjection.value.evidence);
    }

    const recomputed = compileExecutorCompatibilityMatrix(
      {
        scope: loadedRecord.value.matrix.scope,
        policy: trustedPolicy,
        evidence: verifiedEvidence.sort((left, right) =>
          left.evidenceDigest.localeCompare(right.evidenceDigest),
        ),
      },
      this.digestPort,
    );
    if (recomputed.status === ResultStatus.Failure) {
      return corruptStore("Executor Compatibility 持久化记录无法完成重编译。", matrixDigest, {
        causeCode: recomputed.error.code,
      });
    }

    const storedContentDigest = this.digestPort.calculate(loadedRecord.value.matrix);
    if (storedContentDigest.status === ResultStatus.Failure) return storedContentDigest;
    const recomputedContentDigest = this.digestPort.calculate(recomputed.value);
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

    return success({ matrix: recomputed.value, recomputed: true });
  }
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
