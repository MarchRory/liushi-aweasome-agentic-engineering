import { parseArtifactId } from "../../../src/domain/artifact/index.js";
import { GateEvaluationResult } from "../../../src/domain/policy/index.js";
import {
  DependencyAssessmentStatus,
  PR_READY_ARTIFACT_SCHEMA_VERSION,
  RepositoryDeliveryArtifactType,
  type PrReadyArtifact,
} from "../../../src/domain/repositoryDelivery/index.js";
import { parseTaskId } from "../../../src/domain/task/index.js";
import { VerificationStatus } from "../../../src/domain/verification/index.js";
import { ResultStatus, type HarnessError, type Result } from "../../../src/common/index.js";

import {
  calculateVerificationCompletionDigest,
  createVerificationCompletionPlan,
  verificationCompletionCodingTaskId,
  verificationCompletionRepositoryId,
  verificationCompletionWorkspaceId,
} from "./codingTaskVerificationCompletionFixture.js";

/** 创建 Completion Service 返回的完整 PR-ready Artifact。 */
export function createVerificationCompletionPrReadyArtifact(): PrReadyArtifact {
  const plan = createVerificationCompletionPlan();
  const artifactDigest = calculateVerificationCompletionDigest({ artifact: "pr-ready" });
  const bindingDigest = calculateVerificationCompletionDigest({ binding: "verification" });
  return {
    artifactId: "pr-ready:verification-completion",
    artifactDigest,
    schemaVersion: PR_READY_ARTIFACT_SCHEMA_VERSION,
    artifactType: RepositoryDeliveryArtifactType.PrReady,
    workspaceId: verificationCompletionWorkspaceId,
    repositoryId: verificationCompletionRepositoryId,
    codingTaskId: verificationCompletionCodingTaskId,
    sourceTaskId: unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB3")),
    baseRevision: plan.baseRevision,
    headRevision: plan.targetRevision,
    worktreeId: plan.worktreeId,
    branchName: plan.expectedBranchName,
    writeSet: ["src/index.ts"],
    changedPaths: ["src/index.ts"],
    diffDigest: bindingDigest,
    inputBindingSet: { bindings: [] },
    verification: {
      verificationRunId: "verification-run-1",
      planId: plan.planId,
      planDigest: calculateVerificationCompletionDigest(plan),
      evidenceBundleDigest: bindingDigest,
      status: VerificationStatus.Passed,
    },
    authorization: {
      planRisk: {
        artifactId: unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAV")),
        artifactDigest: bindingDigest,
        result: GateEvaluationResult.Allow,
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
    remainingRisks: [],
    riskOperations: [],
    rollbackPlan: [],
    dependencyAssessment: {
      status: DependencyAssessmentStatus.NotAssessed,
      changes: [],
    },
    assembledAt: "2026-07-28T00:00:02.000Z",
  };
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
