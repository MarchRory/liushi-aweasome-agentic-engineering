import type {
  CodexCompatibilityEvidenceProjectorPort,
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
    private readonly projector: CodexCompatibilityEvidenceProjectorPort,
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

    const loadedProjection = await this.evidenceStore.loadProjection(
      loadedRecord.value.matrix.evidenceDigests,
    );
    if (loadedProjection.status === ResultStatus.Failure) {
      if (loadedProjection.error.code === HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound) {
        return corruptStore(
          "Executor Compatibility Matrix 引用的 Evidence 不存在。",
          matrixDigest,
          {
            evidenceDigest: loadedProjection.error.details["evidenceDigest"] ?? "unknown",
          },
        );
      }
      return loadedProjection;
    }
    const verifiedProjection = this.projector.verifyPersistedProjection(loadedProjection.value);
    if (verifiedProjection.status === ResultStatus.Failure) {
      return corruptStore("Codex 持久化 Projection 无法通过确定性复验。", matrixDigest, {
        causeCode: verifiedProjection.error.code,
      });
    }

    const recomputed = compileExecutorCompatibilityMatrix(
      {
        scope: loadedRecord.value.matrix.scope,
        policy: trustedPolicy,
        evidence: verifiedProjection.value.evidence,
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
