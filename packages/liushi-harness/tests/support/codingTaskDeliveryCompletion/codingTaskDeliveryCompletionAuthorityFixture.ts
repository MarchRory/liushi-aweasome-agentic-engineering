import { join, resolve } from "node:path";

import {
  CODING_TASK_AGGREGATE_TYPE,
  CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
  CodingTaskSessionEffectiveCloseoutSource,
  createCommandEnvelope,
  parseCodingTaskSessionDeliverySubmissionCommand,
  type CodingTaskSessionDeliverySubmissionCommand,
  type ReadyVerificationPlanSelection,
} from "../../../src/application/index.js";
import {
  CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  ActorKind,
  ResultStatus,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "../../../src/common/index.js";
import { parseArtifactDigest, parseArtifactId } from "../../../src/domain/artifact/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  parseCodingTaskId,
  type CodingTaskAggregate,
} from "../../../src/domain/codingTask/index.js";
import { parseCodingTaskSessionId } from "../../../src/domain/codingTaskSession/index.js";
import { GateEvaluationResult } from "../../../src/domain/policy/index.js";
import {
  DependencyAssessmentStatus,
  PR_READY_ARTIFACT_SCHEMA_VERSION,
  RepositoryDeliveryArtifactType,
  type PrReadyArtifact,
} from "../../../src/domain/repositoryDelivery/index.js";
import {
  RuleFileKind,
  RuleOperation,
  type RuleResolutionContext,
} from "../../../src/domain/rule/index.js";
import {
  VerificationImpactSelectionStatus,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  type EvidenceBundle,
  type VerificationPlan,
} from "../../../src/domain/verification/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";
import { compilerProvenance, compilerRepoA } from "../profileCompile/index.js";

export const deliveryCompletionDigest = new Rfc8785Sha256DigestAdapter();
export const deliveryCompletionRepositoryRoot = resolve("delivery-completion-repository");
export const deliveryCompletionWorktreeRoot = join(
  deliveryCompletionRepositoryRoot,
  "worktrees",
  "coding-task-1",
);
const profileDigest = contentDigest("1");

/** 创建 Delivery 后重新加载的权威 CodingTask。 */
export function createDeliveryAggregate(): CodingTaskAggregate {
  return {
    schemaVersion: CODING_TASK_AGGREGATE_SCHEMA_VERSION,
    codingTaskId: unwrap(parseCodingTaskId("coding-task-1")),
    workspaceId: compilerProvenance.workspaceId,
    sourceTaskId: compilerProvenance.taskId,
    repositoryId: compilerRepoA,
    baseRevision: `repo-rev-${compilerRepoA}`,
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: "worktrees/coding-task-1",
      branchName: "feature/completion",
      managed: true,
    },
    writeSet: ["src/example.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAT")),
        artifactDigest: unwrap(parseArtifactDigest(contentDigest("4"))),
        result: GateEvaluationResult.Allow,
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
    phase: CodingTaskPhase.Verification,
    runState: CodingTaskRunState.Active,
    attempts: [
      {
        number: 1,
        startedAt: "2026-07-28T00:00:00.000Z",
        finishedAt: "2026-07-28T00:01:00.000Z",
        outcome: CodingTaskAttemptOutcome.Succeeded,
        targetRevision: "target-revision-1",
        changedPaths: ["src/example.ts"],
      },
    ],
    version: 4,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:01:00.000Z",
  };
}

/** 创建已由权威 Selector 返回的 Ready Plan。 */
export function createDeliveryPlanSelection(
  aggregate: CodingTaskAggregate,
): ReadyVerificationPlanSelection {
  const sourceRefs = {
    projectProfileBundleDigest: contentDigest("2"),
    projectProfileDigest: profileDigest,
    proposalArtifactDigest: compilerProvenance.proposalArtifactDigest,
    profileApprovalId: compilerProvenance.approvalId,
    applicableRuleBundleDigest: contentDigest("3"),
  };
  const plan: VerificationPlan = {
    schemaVersion: 2,
    planId: "plan-1",
    repositoryId: aggregate.repositoryId,
    worktreeId: aggregate.worktreeBinding.worktreeId,
    expectedBranchName: aggregate.worktreeBinding.branchName,
    baseRevision: aggregate.baseRevision,
    targetRevision: aggregate.attempts[0]!.targetRevision!,
    sourceRefs,
    checks: [
      {
        checkId: "project.typecheck",
        kind: VerificationKind.Typecheck,
        requirement: VerificationRequirement.Required,
        command: {
          executable: "corepack",
          args: ["pnpm", "typecheck"],
          workingDirectory: "",
          allowedEnvironmentKeys: ["PATH"],
        },
        timeoutMs: 120_000,
        retryable: false,
      },
    ],
  };
  return {
    status: VerificationImpactSelectionStatus.Ready,
    sourceRefs,
    plan,
    selection: {
      status: VerificationImpactSelectionStatus.Ready,
      checks: [],
      diagnostics: [],
    },
  };
}

/** 创建与当前 CodingTask 身份一致的 Rule Resolution Context。 */
export function createDeliveryRuleContext(aggregate: CodingTaskAggregate): RuleResolutionContext {
  return {
    taskId: aggregate.sourceTaskId,
    workspaceRef: {
      workspaceId: aggregate.workspaceId,
      workspaceGraphRevision: "graph-rev-1",
    },
    repositoryRefs: [
      {
        repositoryId: aggregate.repositoryId,
        repositoryRevision: aggregate.baseRevision,
        projectProfileRevision: profileDigest,
      },
    ],
    targets: [
      {
        targetId: "target-src",
        repositoryId: aggregate.repositoryId,
        relativePath: "src/example.ts",
        language: "typescript",
        fileKind: RuleFileKind.Source,
        operation: RuleOperation.Modify,
      },
    ],
    availableValidatorIds: [],
    availableCapabilityIds: [],
  };
}

/** 创建共享尾链返回的通过 Evidence。 */
export function createDeliveryEvidenceBundle(
  selection: ReadyVerificationPlanSelection,
): EvidenceBundle {
  return {
    schemaVersion: 1,
    verificationRunId: "verification-run-1",
    planId: selection.plan.planId,
    repositoryId: selection.plan.repositoryId,
    worktreeId: selection.plan.worktreeId,
    baseRevision: selection.plan.baseRevision,
    targetRevision: selection.plan.targetRevision,
    planDigest: unwrap(deliveryCompletionDigest.calculate(selection.plan)),
    status: VerificationStatus.Passed,
    generatedAt: "2026-07-28T00:02:00.000Z",
    checks: [],
  };
}

/** 创建 Delivery Completion 投影使用的 PR-ready Artifact。 */
export function createDeliveryPrReadyArtifact(
  aggregate: CodingTaskAggregate,
  evidence: EvidenceBundle,
): PrReadyArtifact {
  return {
    schemaVersion: PR_READY_ARTIFACT_SCHEMA_VERSION,
    artifactType: RepositoryDeliveryArtifactType.PrReady,
    artifactId: "pr-ready:test",
    artifactDigest: contentDigest("6"),
    workspaceId: aggregate.workspaceId,
    repositoryId: aggregate.repositoryId,
    codingTaskId: aggregate.codingTaskId,
    sourceTaskId: aggregate.sourceTaskId,
    baseRevision: aggregate.baseRevision,
    headRevision: evidence.targetRevision,
    worktreeId: aggregate.worktreeBinding.worktreeId,
    branchName: aggregate.worktreeBinding.branchName,
    writeSet: aggregate.writeSet,
    changedPaths: aggregate.attempts[0]!.changedPaths!,
    diffDigest: contentDigest("7"),
    inputBindingSet: aggregate.inputBindingSet,
    verification: {
      verificationRunId: evidence.verificationRunId,
      planId: evidence.planId,
      planDigest: evidence.planDigest,
      evidenceBundleDigest: contentDigest("8"),
      status: VerificationStatus.Passed,
    },
    authorization: aggregate.executionAuthorization,
    remainingRisks: [],
    riskOperations: [],
    rollbackPlan: [],
    dependencyAssessment: {
      status: DependencyAssessmentStatus.NotAssessed,
      changes: [],
    },
    assembledAt: "2026-07-28T00:02:00.000Z",
  };
}

/** 创建绑定 Delivery 前版本与 Effective Closeout 的命令。 */
export function createDeliveryCommand(
  aggregate: CodingTaskAggregate,
): CodingTaskSessionDeliverySubmissionCommand {
  const payload = {
    workspaceId: aggregate.workspaceId,
    sessionId: unwrap(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5HB0")),
    expectedCheckpointBindingDigest: contentDigest("5"),
    expectedEffectiveSource: CodingTaskSessionEffectiveCloseoutSource.Original,
  };
  const envelope = unwrap(
    createCommandEnvelope({
      commandId: "delivery-command-1",
      commandType: CODING_TASK_SESSION_DELIVERY_SUBMISSION_COMMAND_TYPE,
      aggregateType: CODING_TASK_AGGREGATE_TYPE,
      aggregateId: aggregate.codingTaskId,
      expectedVersion: aggregate.version - 1,
      idempotencyKey: "delivery-command-1",
      requestDigest: unwrap(deliveryCompletionDigest.calculate(payload)),
      actor: { kind: ActorKind.Agent, actorId: "agent-1" },
      authorizationContext: {},
      correlationId: "delivery-correlation-1",
      submittedAt: "2026-07-28T00:00:00.000Z",
      payload,
    }),
  );
  return unwrap(
    parseCodingTaskSessionDeliverySubmissionCommand(envelope, deliveryCompletionDigest),
  );
}

function contentDigest(seed: string): ContentDigest {
  return `sha256:${seed.repeat(64)}` as ContentDigest;
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
