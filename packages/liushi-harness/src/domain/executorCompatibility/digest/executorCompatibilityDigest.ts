import type {
  ExecutorCapabilityEvidence,
  ExecutorCapabilityQualifier,
  ExecutorCompatibilityMatrix,
  ExecutorCompatibilityPolicy,
  ExecutorHostScope,
} from "../contracts/index.js";

/** 创建排除 Evidence Digest 自身后的稳定摘要输入。 */
export function createExecutorCapabilityEvidenceDigestInput(
  evidence: ExecutorCapabilityEvidence | Omit<ExecutorCapabilityEvidence, "evidenceDigest">,
): Omit<ExecutorCapabilityEvidence, "evidenceDigest"> {
  return {
    schemaVersion: evidence.schemaVersion,
    scope: normalizeScope(evidence.scope),
    capability: evidence.capability,
    kind: evidence.kind,
    outcome: evidence.outcome,
    qualifiers: normalizeQualifiers(evidence.qualifiers),
    source: {
      ...evidence.source,
      checkIds: [...evidence.source.checkIds].sort(compare),
    },
  };
}

/** 创建经过排序且不含自引用字段的 Policy Digest 输入。 */
export function createExecutorCompatibilityPolicyDigestInput(
  policy: ExecutorCompatibilityPolicy,
): ExecutorCompatibilityPolicy {
  return {
    ...policy,
    tiers: [...policy.tiers]
      .sort((left, right) => compare(left.level, right.level))
      .map((tier) => ({
        ...tier,
        requirements: [...tier.requirements]
          .map((requirement) => ({
            ...requirement,
            qualifiers: normalizeQualifiers(requirement.qualifiers),
            evidenceKinds: [...requirement.evidenceKinds].sort(compare),
          }))
          .sort((left, right) => compare(requirementIdentity(left), requirementIdentity(right))),
      })),
  };
}

/** 创建排除 Matrix Digest 自身后的稳定摘要输入。 */
export function createExecutorCompatibilityMatrixDigestInput(
  matrix: ExecutorCompatibilityMatrix | Omit<ExecutorCompatibilityMatrix, "matrixDigest">,
): Omit<ExecutorCompatibilityMatrix, "matrixDigest"> {
  const withoutDigest: Omit<ExecutorCompatibilityMatrix, "matrixDigest"> = {
    schemaVersion: matrix.schemaVersion,
    profileId: matrix.profileId,
    scope: matrix.scope,
    policyDigest: matrix.policyDigest,
    supportLevel: matrix.supportLevel,
    tiers: matrix.tiers,
    capabilities: matrix.capabilities,
    evidenceDigests: matrix.evidenceDigests,
  };
  return {
    ...withoutDigest,
    scope: normalizeScope(withoutDigest.scope),
    tiers: [...withoutDigest.tiers]
      .map((tier) => ({
        ...tier,
        missingScopeFields: [...tier.missingScopeFields].sort(compare),
        unsatisfiedRequirementIds: [...tier.unsatisfiedRequirementIds].sort(compare),
      }))
      .sort((left, right) => compare(left.level, right.level)),
    capabilities: [...withoutDigest.capabilities]
      .map((capability) => ({
        ...capability,
        qualifiers: normalizeQualifiers(capability.qualifiers),
        evidenceDigests: [...capability.evidenceDigests].sort(compare),
        requirements: [...capability.requirements]
          .map((requirement) => ({
            ...requirement,
            qualifiers: normalizeQualifiers(requirement.qualifiers),
            evidenceKinds: [...requirement.evidenceKinds]
              .map((assessment) => ({
                ...assessment,
                evidenceDigests: [...assessment.evidenceDigests].sort(compare),
              }))
              .sort((left, right) => compare(left.kind, right.kind)),
          }))
          .sort((left, right) => compare(left.level, right.level)),
      }))
      .sort((left, right) => compare(requirementIdentity(left), requirementIdentity(right))),
    evidenceDigests: [...withoutDigest.evidenceDigests].sort(compare),
  };
}

/** 生成能力和限定符共同组成的稳定 Requirement 身份。 */
export function requirementIdentity(input: {
  readonly capability: string;
  readonly qualifiers: readonly ExecutorCapabilityQualifier[];
}): string {
  return `${input.capability}:${normalizeQualifiers(input.qualifiers)
    .map((qualifier) => `${qualifier.kind}=${qualifier.value}`)
    .join(",")}`;
}

/** 生成精确 Host Scope 的稳定身份。 */
export function executorHostScopeIdentity(scope: ExecutorHostScope): string {
  const normalized = normalizeScope(scope);
  return [
    normalized.adapterKind,
    normalized.distribution,
    normalized.adapterDigest,
    normalized.executorVersion,
    normalized.surface,
    normalized.operatingSystem,
    normalized.architecture,
    normalized.modelId ?? "",
    normalized.permissionMode ?? "",
    normalized.configurationDigest ?? "",
  ].join("|");
}

/** 对限定符执行稳定排序。 */
export function normalizeQualifiers(
  qualifiers: readonly ExecutorCapabilityQualifier[],
): readonly ExecutorCapabilityQualifier[] {
  return [...qualifiers].sort((left, right) =>
    compare(`${left.kind}:${left.value}`, `${right.kind}:${right.value}`),
  );
}

function normalizeScope(scope: ExecutorHostScope): ExecutorHostScope {
  return { ...scope };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
