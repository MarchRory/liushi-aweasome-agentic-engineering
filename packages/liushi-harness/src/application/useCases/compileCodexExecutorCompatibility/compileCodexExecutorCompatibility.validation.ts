import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  ExecutorCapability,
  ExecutorEvidenceKind,
  executorHostScopeIdentity,
  type ExecutorCapabilityEvidence,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

const REQUIRED_HOST_EVIDENCE = Object.freeze([
  { capability: ExecutorCapability.CommandHookHandler, kind: ExecutorEvidenceKind.StaticProbe },
  { capability: ExecutorCapability.CommandHookHandler, kind: ExecutorEvidenceKind.SmokeTest },
  { capability: ExecutorCapability.NativeHookInput, kind: ExecutorEvidenceKind.SmokeTest },
  { capability: ExecutorCapability.PreFileMutation, kind: ExecutorEvidenceKind.SmokeTest },
  { capability: ExecutorCapability.PostFileMutation, kind: ExecutorEvidenceKind.SmokeTest },
  { capability: ExecutorCapability.PreFileMutation, kind: ExecutorEvidenceKind.NegativeTest },
  { capability: ExecutorCapability.DenyFileMutation, kind: ExecutorEvidenceKind.NegativeTest },
] as const);

const REQUIRED_CONTRACT_EVIDENCE = Object.freeze([
  { capability: ExecutorCapability.CommandHookHandler, kind: ExecutorEvidenceKind.ContractTest },
  { capability: ExecutorCapability.NativeHookInput, kind: ExecutorEvidenceKind.ContractTest },
  { capability: ExecutorCapability.PreFileMutation, kind: ExecutorEvidenceKind.ContractTest },
  { capability: ExecutorCapability.PostFileMutation, kind: ExecutorEvidenceKind.ContractTest },
  { capability: ExecutorCapability.DenyFileMutation, kind: ExecutorEvidenceKind.ContractTest },
] as const);

const EXPECTED_MATRIX_EVIDENCE_COUNT = 12;

/** 校验 Host Projection 的精确七条 Evidence，并从动态观察中提取唯一锚点。 */
export function validateCodexHostCompilationProjection(
  projection: ExecutorCompatibilityEvidenceProjection,
): Result<{ readonly scope: ExecutorHostScope; readonly observationAnchor: string }, HarnessError> {
  const exactEvidence = validateExactEvidenceSet(projection, REQUIRED_HOST_EVIDENCE, "Host");
  if (exactEvidence.status === ResultStatus.Failure) return exactEvidence;
  const scope = readExactProjectionScope(projection, "Host");
  if (scope.status === ResultStatus.Failure) return scope;

  const dynamicEvidence = projection.evidence.filter(
    (evidence) =>
      evidence.kind === ExecutorEvidenceKind.SmokeTest ||
      evidence.kind === ExecutorEvidenceKind.NegativeTest,
  );
  const observedAtValues = new Set(dynamicEvidence.map((evidence) => evidence.source.observedAt));
  const observationAnchor = dynamicEvidence[0]?.source.observedAt;
  if (
    dynamicEvidence.length !== REQUIRED_HOST_EVIDENCE.length - 1 ||
    observationAnchor === undefined ||
    observationAnchor.length === 0 ||
    observedAtValues.size !== 1
  ) {
    return invalid("Codex Host 动态 Smoke/Negative Evidence 缺失或 observedAt 不唯一一致。");
  }
  return success({ scope: scope.value, observationAnchor });
}

/** 校验 Contract Projection 的精确五条 Evidence、Scope 与观察锚点。 */
export function validateCodexContractCompilationProjection(
  projection: ExecutorCompatibilityEvidenceProjection,
  scope: ExecutorHostScope,
  observationAnchor: string,
): Result<void, HarnessError> {
  const exactEvidence = validateExactEvidenceSet(
    projection,
    REQUIRED_CONTRACT_EVIDENCE,
    "Contract",
  );
  if (exactEvidence.status === ResultStatus.Failure) return exactEvidence;
  const contractScope = readExactProjectionScope(projection, "Contract");
  if (contractScope.status === ResultStatus.Failure) return contractScope;
  if (executorHostScopeIdentity(contractScope.value) !== executorHostScopeIdentity(scope)) {
    return invalid("Codex Contract Projection 与 Host Projection 的精确 Scope 漂移。");
  }
  if (projection.evidence.some((evidence) => evidence.source.observedAt !== observationAnchor)) {
    return invalid("Codex Contract Projection 未绑定 Host 动态 Evidence 的唯一观察锚点。");
  }
  return success(undefined);
}

/** 校验合并集合恰好包含十二条唯一 Evidence，且不含 ProductionE2e。 */
export function validateCodexCompilationEvidenceSet(
  evidence: readonly ExecutorCapabilityEvidence[],
  scope: ExecutorHostScope,
): Result<void, HarnessError> {
  if (
    evidence.length !== EXPECTED_MATRIX_EVIDENCE_COUNT ||
    new Set(evidence.map((item) => item.evidenceDigest)).size !== EXPECTED_MATRIX_EVIDENCE_COUNT
  ) {
    return invalid("Codex Executor Compatibility 必须合并为十二条唯一 Evidence。");
  }
  const scopeIdentity = executorHostScopeIdentity(scope);
  if (
    evidence.some((item) => executorHostScopeIdentity(item.scope) !== scopeIdentity) ||
    evidence.some((item) => item.kind === ExecutorEvidenceKind.ProductionE2e)
  ) {
    return invalid(
      "Codex Executor Compatibility Evidence Scope 漂移或包含未证明的 ProductionE2e。",
    );
  }
  return success(undefined);
}

function validateExactEvidenceSet(
  projection: ExecutorCompatibilityEvidenceProjection,
  required: readonly {
    readonly capability: ExecutorCapability;
    readonly kind: ExecutorEvidenceKind;
  }[],
  sourceLabel: string,
): Result<void, HarnessError> {
  if (
    projection.evidence.length !== required.length ||
    new Set(projection.evidence.map((evidence) => evidence.evidenceDigest)).size !== required.length
  ) {
    return invalid(`Codex ${sourceLabel} Projection Evidence 数量或摘要唯一性无效。`);
  }
  if (
    required.some(
      (identity) =>
        projection.evidence.filter(
          (evidence) =>
            evidence.capability === identity.capability && evidence.kind === identity.kind,
        ).length !== 1,
    )
  ) {
    return invalid(`Codex ${sourceLabel} Projection 缺少精确能力与 Evidence 类型。`);
  }
  if (
    projection.evidence.some(
      (evidence) => evidence.source.artifactDigest !== projection.artifactDigest,
    )
  ) {
    return invalid(`Codex ${sourceLabel} Projection Evidence 未绑定当前 Artifact Digest。`);
  }
  return success(undefined);
}

function readExactProjectionScope(
  projection: ExecutorCompatibilityEvidenceProjection,
  sourceLabel: string,
): Result<ExecutorHostScope, HarnessError> {
  const firstEvidence = projection.evidence[0];
  if (firstEvidence === undefined) {
    return invalid(`Codex ${sourceLabel} Projection 未生成可用 Evidence。`);
  }
  const scopeIdentity = executorHostScopeIdentity(firstEvidence.scope);
  if (
    projection.evidence.some(
      (evidence) => executorHostScopeIdentity(evidence.scope) !== scopeIdentity,
    )
  ) {
    return invalid(`Codex ${sourceLabel} Projection 内部精确 Scope 漂移。`);
  }
  return success(firstEvidence.scope);
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
