import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import { ClaimClassification, type Claim, type EvidenceRef } from "#domain/evidence/index.js";

import type { ArtifactProposal } from "./artifactContracts.js";
import { ArtifactType } from "./artifactEnums.js";

/** 校验 Proposal 内 Evidence/Claim 引用完整性与唯一性。 */
export function validateArtifactEvidence(proposal: ArtifactProposal): Result<void, HarnessError> {
  switch (proposal.artifactType) {
    case ArtifactType.RequirementContract:
      return validateEvidenceAndClaims(proposal.payload.evidence, proposal.payload.claims);
    case ArtifactType.BusinessLogicChangeContract:
      return validateEvidenceAndClaims(proposal.payload.evidence, [
        ...proposal.payload.currentBehavior.facts,
        ...proposal.payload.currentBehavior.inferences,
      ]);
    case ArtifactType.PlanRisk:
      return success(undefined);
  }
}

function validateEvidenceAndClaims(
  evidence: readonly EvidenceRef[],
  claims: readonly Claim[],
): Result<void, HarnessError> {
  const evidenceIds = new Set(evidence.map((item) => item.evidenceId));
  if (evidenceIds.size !== evidence.length) {
    return policyFailure("Artifact contains duplicate Evidence IDs.", "evidence");
  }
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  if (claimIds.size !== claims.length) {
    return policyFailure("Artifact contains duplicate Claim IDs.", "claims");
  }

  for (const claim of claims) {
    if (claim.classification !== ClaimClassification.Unknown && claim.evidenceIds.length === 0) {
      return policyFailure(
        "Fact and Inference claims must reference Evidence.",
        `claim:${claim.claimId}`,
      );
    }
    const missing = claim.evidenceIds.find((evidenceId) => !evidenceIds.has(evidenceId));
    if (missing !== undefined) {
      return policyFailure(
        "Claim references Evidence that is not included in the Artifact.",
        `claim:${claim.claimId}`,
        missing,
      );
    }
  }
  return success(undefined);
}

function policyFailure(
  message: string,
  field: string,
  evidenceId?: string,
): Result<void, HarnessError> {
  return failure(
    new HarnessError(HarnessErrorCode.InvalidInput, message, {
      field,
      ...(evidenceId === undefined ? {} : { evidenceId }),
    }),
  );
}
