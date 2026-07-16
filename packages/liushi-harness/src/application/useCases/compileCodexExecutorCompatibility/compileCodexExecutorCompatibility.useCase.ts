import type {
  CodexCompatibilityEvidenceProjectorPort,
  CodexContractEvidenceProjectorPort,
  ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
  ExecutorCompatibilityEvidenceWriteResult,
  ExecutorCompatibilityEvidenceStore,
  ExecutorCompatibilityMatrixWriteResult,
  ExecutorCompatibilityMatrixStore,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
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

import {
  validateCodexCompilationEvidenceSet,
  validateCodexContractCompilationProjection,
  validateCodexHostCompilationProjection,
} from "./compileCodexExecutorCompatibility.validation.js";

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
  /** 按 Host、Contract 稳定顺序返回的两项 Projection 持久化回执。 */
  readonly evidencePersistences: readonly [
    ExecutorCompatibilityEvidenceWriteResult,
    ExecutorCompatibilityEvidenceWriteResult,
  ];
  /** Matrix 与 Policy 记录的持久化回执。 */
  readonly matrixPersistence: ExecutorCompatibilityMatrixWriteResult;
}

/** 编排 Codex 证据投影、Domain 编译和顺序持久化。 */
export class CompileCodexExecutorCompatibilityUseCase {
  public constructor(
    private readonly hostProjector: CodexCompatibilityEvidenceProjectorPort,
    private readonly contractProjector: CodexContractEvidenceProjectorPort,
    private readonly verifier: ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
    private readonly evidenceStore: ExecutorCompatibilityEvidenceStore,
    private readonly matrixStore: ExecutorCompatibilityMatrixStore,
    private readonly digestPort: ExecutorCompatibilityDigestPort,
  ) {}

  /** 仅在 Projection 与 Matrix 记录均成功持久化后返回成功。 */
  public async execute(
    input: CompileCodexExecutorCompatibilityInput,
  ): Promise<Result<CompileCodexExecutorCompatibilityOutput, HarnessErrorType>> {
    const hostProjection = this.hostProjector.project({
      ...input,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });
    if (hostProjection.status === ResultStatus.Failure) return hostProjection;

    const projectedHostContext = validateCodexHostCompilationProjection(hostProjection.value);
    if (projectedHostContext.status === ResultStatus.Failure) return projectedHostContext;
    const contractProjection = await this.contractProjector.project({
      scope: projectedHostContext.value.scope,
      hostArtifactDigest: hostProjection.value.artifactDigest,
      observationAnchor: projectedHostContext.value.observationAnchor,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });
    if (contractProjection.status === ResultStatus.Failure) return contractProjection;

    const verified = this.verifier.verifyPersistedProjectionSet([
      hostProjection.value,
      contractProjection.value,
    ]);
    if (verified.status === ResultStatus.Failure) {
      return invalidVerifiedProjectionSet(verified.error);
    }
    if (verified.value.length !== 2) return invalidVerifiedProjectionSet();
    const verifiedHostProjection = verified.value[0];
    const verifiedContractProjection = verified.value[1];
    if (verifiedHostProjection === undefined || verifiedContractProjection === undefined) {
      return invalidVerifiedProjectionSet();
    }

    const hostContext = validateCodexHostCompilationProjection(verifiedHostProjection);
    if (hostContext.status === ResultStatus.Failure) return hostContext;
    const contractValidation = validateCodexContractCompilationProjection(
      verifiedContractProjection,
      hostContext.value.scope,
      hostContext.value.observationAnchor,
    );
    if (contractValidation.status === ResultStatus.Failure) return contractValidation;

    const evidence = [...verifiedHostProjection.evidence, ...verifiedContractProjection.evidence];
    const evidenceValidation = validateCodexCompilationEvidenceSet(
      evidence,
      hostContext.value.scope,
    );
    if (evidenceValidation.status === ResultStatus.Failure) return evidenceValidation;
    const policy = createManagedFileMutationHookPolicy();
    const compiled = compileExecutorCompatibilityMatrix(
      { scope: hostContext.value.scope, policy, evidence },
      this.digestPort,
    );
    if (compiled.status === ResultStatus.Failure) return compiled;

    const hostPersistence = await this.evidenceStore.persist(verifiedHostProjection);
    if (hostPersistence.status === ResultStatus.Failure) return hostPersistence;
    const contractPersistence = await this.evidenceStore.persist(verifiedContractProjection);
    if (contractPersistence.status === ResultStatus.Failure) return contractPersistence;

    const matrixPersistence = await this.matrixStore.persist({
      matrix: compiled.value,
      policy,
    });
    if (matrixPersistence.status === ResultStatus.Failure) return matrixPersistence;

    return success({
      matrix: compiled.value,
      evidencePersistences: [hostPersistence.value, contractPersistence.value],
      matrixPersistence: matrixPersistence.value,
    });
  }
}

function invalidVerifiedProjectionSet(cause?: HarnessErrorType): Result<never, HarnessErrorType> {
  return failure(
    new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Codex Executor Compatibility 新鲜 Projection 集合复验失败。",
      cause === undefined ? {} : { causeCode: cause.code },
      cause,
    ),
  );
}
