import {
  ResultStatus,
  success,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";

import { EXECUTOR_COMPATIBILITY_MATRIX_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorCompatibilityDigestPort,
  ExecutorCompatibilityMatrix,
  ExecutorCompatibilityPolicy,
  ExecutorHostScope,
} from "../contracts/index.js";
import {
  createExecutorCompatibilityMatrixDigestInput,
  createExecutorCompatibilityPolicyDigestInput,
} from "../digest/index.js";
import {
  ExecutorEvidenceOutcome,
  ExecutorRequirementStatus,
  ExecutorSupportLevel,
} from "../enums/index.js";
import { assessExecutorCapabilities } from "./executorCapabilityAssessment.js";
import { assessExecutorSupportTiers, highestSatisfiedTier } from "./executorTierAssessment.js";

/** 从已校验输入构建确定性的兼容性矩阵，调用方必须先完成输入与证据完整性校验。 */
export function buildExecutorCompatibilityMatrix(
  scope: ExecutorHostScope,
  policy: ExecutorCompatibilityPolicy,
  evidence: readonly ExecutorCapabilityEvidence[],
  digestPort: ExecutorCompatibilityDigestPort,
): Result<ExecutorCompatibilityMatrix, HarnessError> {
  const policyDigest = digestPort.calculate(createExecutorCompatibilityPolicyDigestInput(policy));
  if (policyDigest.status === ResultStatus.Failure) return policyDigest;

  const capabilities = assessExecutorCapabilities(policy.tiers, evidence);
  const tiers = assessExecutorSupportTiers(scope, policy.tiers, capabilities);
  const matrixWithoutDigest: Omit<ExecutorCompatibilityMatrix, "matrixDigest"> = {
    schemaVersion: EXECUTOR_COMPATIBILITY_MATRIX_SCHEMA_VERSION,
    profileId: policy.profileId,
    scope,
    policyDigest: policyDigest.value,
    supportLevel: resolveSupportLevel(evidence, tiers, capabilities),
    tiers,
    capabilities,
    evidenceDigests: uniqueEvidenceDigests(evidence),
  };
  const matrixDigest = digestPort.calculate(
    createExecutorCompatibilityMatrixDigestInput(matrixWithoutDigest),
  );
  return matrixDigest.status === ResultStatus.Failure
    ? matrixDigest
    : success({ ...matrixWithoutDigest, matrixDigest: matrixDigest.value });
}

function resolveSupportLevel(
  evidence: readonly ExecutorCapabilityEvidence[],
  tiers: ReturnType<typeof assessExecutorSupportTiers>,
  capabilities: ReturnType<typeof assessExecutorCapabilities>,
): ExecutorSupportLevel {
  if (
    capabilities.some((capability) =>
      capability.requirements.some(
        (requirement) => requirement.status === ExecutorRequirementStatus.Conflicting,
      ),
    )
  ) {
    return ExecutorSupportLevel.Unverified;
  }
  if (evidence.some((item) => item.outcome === ExecutorEvidenceOutcome.Failed)) {
    return ExecutorSupportLevel.Unsupported;
  }
  const satisfied = highestSatisfiedTier(tiers);
  if (satisfied !== undefined) return satisfied;
  return evidence.some((item) => item.outcome === ExecutorEvidenceOutcome.Passed)
    ? ExecutorSupportLevel.Experimental
    : ExecutorSupportLevel.Unverified;
}

function uniqueEvidenceDigests(
  evidence: readonly ExecutorCapabilityEvidence[],
): readonly ContentDigest[] {
  return [...new Set(evidence.map((item) => item.evidenceDigest))].sort(compare);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
