import type { ContentDigest } from "#common/index.js";

import type {
  ExecutorCapabilityAssessment,
  ExecutorCapabilityEvidence,
  ExecutorCapabilityRequirement,
  ExecutorEvidenceKindAssessment,
  ExecutorRequirementAssessment,
  ExecutorSupportTierPolicy,
} from "../contracts/index.js";
import { normalizeQualifiers, requirementIdentity } from "../digest/index.js";
import {
  ExecutorCapabilitySupport,
  ExecutorEvidenceOutcome,
  ExecutorRequirementStatus,
  ExecutorSupportLevel,
} from "../enums/index.js";
import { includesQualifiers } from "../utils/index.js";

/** 为 Policy 中全部能力 Requirement 生成确定性细分结论。 */
export function assessExecutorCapabilities(
  tiers: readonly ExecutorSupportTierPolicy[],
  evidence: readonly ExecutorCapabilityEvidence[],
): readonly ExecutorCapabilityAssessment[] {
  const requirements = uniqueRequirements(tiers);
  return requirements
    .map((requirement) => assessCapability(requirement, tiers, evidence))
    .sort((left, right) => compare(requirementIdentity(left), requirementIdentity(right)));
}

function assessCapability(
  requirement: ExecutorCapabilityRequirement,
  tiers: readonly ExecutorSupportTierPolicy[],
  evidence: readonly ExecutorCapabilityEvidence[],
): ExecutorCapabilityAssessment {
  const matchingEvidence = evidence.filter(
    (item) =>
      item.capability === requirement.capability &&
      includesQualifiers(item.qualifiers, requirement.qualifiers),
  );
  const assessments = tiers
    .flatMap((tier) => {
      const tierRequirement = tier.requirements.find(
        (item) => requirementIdentity(item) === requirementIdentity(requirement),
      );
      return tierRequirement === undefined
        ? []
        : [assessRequirement(tier, tierRequirement, matchingEvidence)];
    })
    .sort((left, right) => compare(left.level, right.level));
  return {
    capability: requirement.capability,
    qualifiers: normalizeQualifiers(requirement.qualifiers),
    support: capabilitySupport(assessments, matchingEvidence),
    requirements: assessments,
    evidenceDigests: uniqueDigests(matchingEvidence),
  };
}

function assessRequirement(
  tier: ExecutorSupportTierPolicy,
  requirement: ExecutorCapabilityRequirement,
  evidence: readonly ExecutorCapabilityEvidence[],
): ExecutorRequirementAssessment {
  const evidenceKinds = [...requirement.evidenceKinds]
    .sort(compare)
    .map((kind) => assessEvidenceKind(kind, evidence));
  return {
    level: tier.level,
    capability: requirement.capability,
    qualifiers: normalizeQualifiers(requirement.qualifiers),
    status: requirementStatus(evidenceKinds),
    evidenceKinds,
  };
}

function assessEvidenceKind(
  kind: ExecutorCapabilityRequirement["evidenceKinds"][number],
  evidence: readonly ExecutorCapabilityEvidence[],
): ExecutorEvidenceKindAssessment {
  const matching = evidence.filter((item) => item.kind === kind);
  const outcomes = new Set(matching.map((item) => item.outcome));
  const status =
    outcomes.size > 1
      ? ExecutorRequirementStatus.Conflicting
      : outcomes.size === 1 && outcomes.has(ExecutorEvidenceOutcome.Failed)
        ? ExecutorRequirementStatus.Failed
        : outcomes.size === 1 && outcomes.has(ExecutorEvidenceOutcome.Passed)
          ? ExecutorRequirementStatus.Satisfied
          : ExecutorRequirementStatus.Missing;
  return { kind, status, evidenceDigests: uniqueDigests(matching) };
}

function requirementStatus(
  assessments: readonly ExecutorEvidenceKindAssessment[],
): ExecutorRequirementStatus {
  if (assessments.some((item) => item.status === ExecutorRequirementStatus.Conflicting)) {
    return ExecutorRequirementStatus.Conflicting;
  }
  if (assessments.some((item) => item.status === ExecutorRequirementStatus.Failed)) {
    return ExecutorRequirementStatus.Failed;
  }
  if (assessments.some((item) => item.status === ExecutorRequirementStatus.Missing)) {
    return ExecutorRequirementStatus.Missing;
  }
  return ExecutorRequirementStatus.Satisfied;
}

function capabilitySupport(
  assessments: readonly ExecutorRequirementAssessment[],
  evidence: readonly ExecutorCapabilityEvidence[],
): ExecutorCapabilitySupport {
  if (assessments.some((item) => item.status === ExecutorRequirementStatus.Conflicting)) {
    return ExecutorCapabilitySupport.Unverified;
  }
  if (assessments.some((item) => item.status === ExecutorRequirementStatus.Failed)) {
    return ExecutorCapabilitySupport.Unsupported;
  }
  const compatible = assessments.find((item) => item.level === ExecutorSupportLevel.Compatible);
  if (compatible?.status === ExecutorRequirementStatus.Satisfied) {
    return ExecutorCapabilitySupport.Verified;
  }
  return evidence.some((item) => item.outcome === ExecutorEvidenceOutcome.Passed)
    ? ExecutorCapabilitySupport.Experimental
    : ExecutorCapabilitySupport.Unverified;
}

function uniqueRequirements(
  tiers: readonly ExecutorSupportTierPolicy[],
): readonly ExecutorCapabilityRequirement[] {
  const indexed = new Map<string, ExecutorCapabilityRequirement>();
  for (const tier of tiers) {
    for (const requirement of tier.requirements) {
      indexed.set(requirementIdentity(requirement), requirement);
    }
  }
  return [...indexed.values()];
}

function uniqueDigests(evidence: readonly ExecutorCapabilityEvidence[]): readonly ContentDigest[] {
  return [...new Set(evidence.map((item) => item.evidenceDigest))].sort(compare);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
