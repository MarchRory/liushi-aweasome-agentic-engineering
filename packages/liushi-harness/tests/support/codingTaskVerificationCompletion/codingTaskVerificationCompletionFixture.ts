import {
  CODING_TASK_AGGREGATE_TYPE,
  CommandErrorCode,
  CommandStatus,
  VERIFICATION_RUN_COMMAND_TYPE,
  createCommandEnvelope,
  createCommandReceipt,
  type CommandEnvelope,
  type CommandReceipt,
  type RunVerificationCommandPayload,
  type VerificationCommandRuntimeContext,
} from "../../../src/application/index.js";
import {
  ActorKind,
  ResultStatus,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "../../../src/common/index.js";
import { parseApprovalId } from "../../../src/domain/approval/index.js";
import { parseCodingTaskId } from "../../../src/domain/codingTask/index.js";
import { EvidenceKind } from "../../../src/domain/evidence/index.js";
import {
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VerificationFailureKind,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  type EvidenceBundle,
  type VerificationPlan,
} from "../../../src/domain/verification/index.js";
import {
  parseRepositoryId,
  parseWorkspaceId,
  type RepositoryId,
} from "../../../src/domain/workspace/index.js";
import { FailureTaxonomy } from "../../../src/domain/workflow/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";

export const verificationCompletionDigest = new Rfc8785Sha256DigestAdapter();
export const verificationCompletionWorkspaceId = unwrap(parseWorkspaceId("workspace-1"));
export const verificationCompletionRepositoryId = unwrap(parseRepositoryId("repository-1"));
export const verificationCompletionOtherRepositoryId = unwrap(parseRepositoryId("repository-2"));
export const verificationCompletionCodingTaskId = unwrap(parseCodingTaskId("coding-task-1"));
export const verificationCompletionApprovalId = unwrap(
  parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FB2"),
);

/** Evidence 身份与状态的测试覆盖项。 */
export interface VerificationCompletionEvidenceOverrides {
  readonly status: VerificationStatus;
  readonly planDigest?: ContentDigest;
  readonly repositoryId?: RepositoryId;
}

/** 创建具备真实品牌字段的 Verification Plan。 */
export function createVerificationCompletionPlan(): VerificationPlan {
  return {
    schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
    planId: "plan-1",
    repositoryId: verificationCompletionRepositoryId,
    worktreeId: "worktree-1",
    expectedBranchName: "feature/task",
    baseRevision: "base-revision-1",
    targetRevision: "target-revision-1",
    sourceRefs: {
      projectProfileBundleDigest: calculateVerificationCompletionDigest({
        source: "profile-bundle",
      }),
      projectProfileDigest: calculateVerificationCompletionDigest({ source: "profile" }),
      proposalArtifactDigest: calculateVerificationCompletionDigest({ source: "proposal" }),
      profileApprovalId: verificationCompletionApprovalId,
      applicableRuleBundleDigest: calculateVerificationCompletionDigest({
        source: "rule-bundle",
      }),
    },
    checks: [
      {
        checkId: "check-1",
        kind: VerificationKind.UnitTest,
        requirement: VerificationRequirement.Required,
        command: {
          executable: "node",
          args: ["--version"],
          workingDirectory: "",
          allowedEnvironmentKeys: [],
        },
        timeoutMs: 1_000,
        retryable: false,
      },
    ],
  };
}

/** 创建严格类型化的 Verification Command。 */
export function createVerificationCompletionCommand(): CommandEnvelope<RunVerificationCommandPayload> {
  const payload: RunVerificationCommandPayload = {
    workspaceId: verificationCompletionWorkspaceId,
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
    verificationRunId: "verification-run-1",
    attemptNumber: 1,
    worktreeRootDigest: calculateVerificationCompletionDigest({
      worktreeRoot: "repository/worktrees/task",
    }),
    plan: createVerificationCompletionPlan(),
    failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
  };
  return unwrap(
    createCommandEnvelope({
      commandId: "verification-command-1",
      commandType: VERIFICATION_RUN_COMMAND_TYPE,
      aggregateType: CODING_TASK_AGGREGATE_TYPE,
      aggregateId: verificationCompletionCodingTaskId,
      expectedVersion: 1,
      idempotencyKey: "verification-command-1",
      requestDigest: calculateVerificationCompletionDigest(payload),
      actor: { kind: ActorKind.Agent, actorId: "agent-1" },
      authorizationContext: {},
      correlationId: "verification-correlation-1",
      submittedAt: "2026-07-28T00:00:00.000Z",
      payload,
    }),
  );
}

/** 创建与 Command 状态一致的合法 Receipt。 */
export function createVerificationCompletionReceipt(status: CommandStatus): CommandReceipt {
  const command = createVerificationCompletionCommand();
  const common = {
    commandId: command.commandId,
    requestDigest: command.requestDigest,
    status,
  };
  switch (status) {
    case CommandStatus.Committed:
      return unwrap(createCommandReceipt({ ...common, committedVersion: command.expectedVersion }));
    case CommandStatus.Duplicate:
      return unwrap(
        createCommandReceipt({ ...common, duplicateOfCommandId: "verification-command-original" }),
      );
    case CommandStatus.Rejected:
      return unwrap(
        createCommandReceipt({ ...common, errorCode: CommandErrorCode.PreconditionNotMet }),
      );
    case CommandStatus.Conflict:
      return unwrap(
        createCommandReceipt({ ...common, errorCode: CommandErrorCode.VersionConflict }),
      );
    case CommandStatus.OutcomeUnknown:
      return unwrap(
        createCommandReceipt({ ...common, errorCode: CommandErrorCode.OutcomeUnknown }),
      );
  }
}

/** 创建具有完整字段的 EvidenceBundle。 */
export function createVerificationCompletionEvidence(
  overrides: VerificationCompletionEvidenceOverrides,
): EvidenceBundle {
  const outputDigest = calculateVerificationCompletionDigest({ output: "verification" });
  const completedAt = "2026-07-28T00:00:01.000Z";
  return {
    schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    verificationRunId: "verification-run-1",
    planId: "plan-1",
    repositoryId: overrides.repositoryId ?? verificationCompletionRepositoryId,
    worktreeId: "worktree-1",
    baseRevision: "base-revision-1",
    targetRevision: "target-revision-1",
    planDigest:
      overrides.planDigest ??
      calculateVerificationCompletionDigest(createVerificationCompletionPlan()),
    status: overrides.status,
    generatedAt: "2026-07-28T00:00:02.000Z",
    checks: [
      {
        checkId: "check-1",
        kind: VerificationKind.UnitTest,
        requirement: VerificationRequirement.Required,
        status: overrides.status,
        ...(overrides.status === VerificationStatus.Failed ||
        overrides.status === VerificationStatus.Blocked
          ? { failureKind: VerificationFailureKind.CommandFailed, exitCode: 1 }
          : { exitCode: 0 }),
        outputDigest,
        startedAt: "2026-07-28T00:00:00.000Z",
        completedAt,
        evidence: {
          evidenceId: "verification-run-1.check-1",
          kind: EvidenceKind.Test,
          source: "unit-test",
          title: "Unit test",
          revision: "target-revision-1",
          observedAt: completedAt,
          contentDigest: outputDigest,
        },
      },
    ],
  };
}

/** 创建不持久化的本地 Verification Runtime。 */
export function createVerificationCompletionRuntime(): VerificationCommandRuntimeContext {
  return { worktreeRoot: "C:\\repository\\worktrees\\task" };
}

/** 使用生产 Digest Adapter 计算测试摘要。 */
export function calculateVerificationCompletionDigest(input: unknown): ContentDigest {
  return unwrap(verificationCompletionDigest.calculate(input));
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
