import type {
  CodexCompatibilityEvidenceProjectorPort,
  ExecutorCompatibilityEvidenceWriteResult,
  ExecutorCompatibilityEvidenceStore,
  ExecutorCompatibilityMatrixWriteResult,
  ExecutorCompatibilityMatrixStore,
} from "#application/ports/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  ExecutorEvidenceLocatorKind,
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
  type ExecutorCompatibilityDigestPort,
  type ExecutorCompatibilityMatrix,
} from "#domain/executorCompatibility/index.js";

/** 编译 Codex Executor Compatibility 的三份未信任 JSON 输入。 */
export interface CompileCodexExecutorCompatibilityInput {
  /** Host Smoke Prepare Manifest 原始 JSON。 */
  readonly prepareManifest: unknown;
  /** Human Activation Plan 原始 JSON。 */
  readonly activationPlan: unknown;
  /** Host Result 原始 JSON。 */
  readonly hostResult: unknown;
}

/** Codex Executor Compatibility 编译与持久化结果。 */
export interface CompileCodexExecutorCompatibilityOutput {
  /** 由 Domain Compiler 生成的 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 受信 Projection 的持久化回执。 */
  readonly evidencePersistence: ExecutorCompatibilityEvidenceWriteResult;
  /** Matrix 与 Policy 记录的持久化回执。 */
  readonly matrixPersistence: ExecutorCompatibilityMatrixWriteResult;
}

/** 编排 Codex 证据投影、Domain 编译和顺序持久化。 */
export class CompileCodexExecutorCompatibilityUseCase {
  public constructor(
    private readonly projector: CodexCompatibilityEvidenceProjectorPort,
    private readonly evidenceStore: ExecutorCompatibilityEvidenceStore,
    private readonly matrixStore: ExecutorCompatibilityMatrixStore,
    private readonly digestPort: ExecutorCompatibilityDigestPort,
  ) {}

  /** 仅在 Projection 与 Matrix 记录均成功持久化后返回成功。 */
  public async execute(
    input: CompileCodexExecutorCompatibilityInput,
  ): Promise<Result<CompileCodexExecutorCompatibilityOutput, HarnessErrorType>> {
    const projection = this.projector.project({
      ...input,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });
    if (projection.status === ResultStatus.Failure) return projection;

    const scope = projection.value.evidence[0]?.scope;
    if (scope === undefined) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Codex 兼容性证据投影未产生可用于编译的 Evidence。",
        ),
      );
    }
    const policy = createManagedFileMutationHookPolicy();
    const compiled = compileExecutorCompatibilityMatrix(
      { scope, policy, evidence: projection.value.evidence },
      this.digestPort,
    );
    if (compiled.status === ResultStatus.Failure) return compiled;

    const evidencePersistence = await this.evidenceStore.persist(projection.value);
    if (evidencePersistence.status === ResultStatus.Failure) return evidencePersistence;

    const matrixPersistence = await this.matrixStore.persist({
      matrix: compiled.value,
      policy,
    });
    if (matrixPersistence.status === ResultStatus.Failure) return matrixPersistence;

    return success({
      matrix: compiled.value,
      evidencePersistence: evidencePersistence.value,
      matrixPersistence: matrixPersistence.value,
    });
  }
}
