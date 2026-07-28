import {
  ActorKind,
  ApprovalDecision,
  ArtifactStatus,
  ArtifactType,
  FailureTaxonomy,
  ResultStatus,
  RuleFileKind,
  RuleOperation,
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
  parseCodingTaskSessionDeliverySubmissionCommand,
  parseRepositoryId,
  parseWorkspaceId,
  type CodingTaskDeliveryCompletionInput,
  type CodingTaskDeliveryProfileCompilationInput,
  type HarnessApplication,
  type VerificationCommandSpec,
} from "../../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";
import {
  createCodingTaskSessionCloseoutCliSetup,
  type CodingTaskSessionCloseoutCliBeforePlanningContext,
  type CodingTaskSessionCloseoutCliSetup,
} from "../codingTaskSessionCloseoutCli/index.js";
import {
  createCodingTaskSessionDeliveryCommand,
  loadCodingTaskSessionDeliveryAggregate,
} from "../codingTaskSessionDelivery/index.js";
import {
  createCompilerCandidate,
  createCompilerProposal,
  createCompilerReport,
} from "../profileCompile/index.js";

export const DELIVERY_COMPLETION_VERIFICATION_RUN_ID = "delivery-completion-verification-run";
const deliveryCompletionDigest = new Rfc8785Sha256DigestAdapter();

/** E2E 中重新编译已批准 Profile 所需的定位输入。 */
type DeliveryCompletionProfileCompilation = CodingTaskDeliveryProfileCompilationInput;

/** 带有预先批准 Profile 的真实 Completion E2E 准备结果。 */
interface CodingTaskDeliveryCompletionE2eSetup {
  /** 已完成 Closeout 前置准备的真实 Git 环境。 */
  readonly setup: CodingTaskSessionCloseoutCliSetup;
  /** 在 Planning 前形成的 G8 Profile 编译输入。 */
  readonly profileCompilation: DeliveryCompletionProfileCompilation;
}

/** 按真实 Artifact 顺序建立带 G8 Profile 的 Closeout E2E。 */
export async function createCodingTaskDeliveryCompletionE2eSetup(
  roots: string[],
): Promise<CodingTaskDeliveryCompletionE2eSetup> {
  return createDeliveryCompletionSetup(roots, {
    executable: "node",
    args: ["--version"],
    workingDirectory: "",
    allowedEnvironmentKeys: ["PATH"],
  });
}

/** 建立使用确定性失败检查的真实 Closeout E2E。 */
export async function createCodingTaskDeliveryFailureE2eSetup(
  roots: string[],
): Promise<CodingTaskDeliveryCompletionE2eSetup> {
  return createDeliveryCompletionSetup(roots, {
    executable: "node",
    args: ["-e", "process.exit(1)"],
    workingDirectory: "",
    allowedEnvironmentKeys: ["PATH"],
  });
}

async function createDeliveryCompletionSetup(
  roots: string[],
  command: VerificationCommandSpec,
): Promise<CodingTaskDeliveryCompletionE2eSetup> {
  let profileCompilation: DeliveryCompletionProfileCompilation | undefined;
  const setup = await createCodingTaskSessionCloseoutCliSetup(roots, {
    beforePlanning: async (context) => {
      profileCompilation = await approveDeliveryCompletionProfile(context, command);
    },
  });
  if (profileCompilation === undefined) {
    throw new Error("Delivery Completion E2E 未在 Planning 前建立 G8 Profile。");
  }
  return { setup, profileCompilation };
}

/** 从已批准的 G8 Profile 构造真实完成态输入。 */
export async function createCodingTaskDeliveryCompletionInput(
  setup: CodingTaskSessionCloseoutCliSetup,
  application: HarnessApplication,
  profileCompilation: DeliveryCompletionProfileCompilation,
): Promise<CodingTaskDeliveryCompletionInput> {
  const aggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
  const profile = await application.compileProjectProfile.execute({
    workspaceId: aggregate.workspaceId,
    ...profileCompilation,
  });
  if (profile.status === ResultStatus.Failure) throw profile.error;
  const deliveryCommand = await createCodingTaskSessionDeliveryCommand(setup);
  const parsedDeliveryCommand = parseCodingTaskSessionDeliverySubmissionCommand(
    deliveryCommand,
    deliveryCompletionDigest,
  );
  if (parsedDeliveryCommand.status === ResultStatus.Failure) throw parsedDeliveryCommand.error;
  return {
    deliveryCommand: parsedDeliveryCommand.value,
    profileCompilation,
    ruleResolutionContext: {
      taskId: aggregate.sourceTaskId,
      workspaceRef: profile.value.ruleCatalog.workspaceRef,
      repositoryRefs: profile.value.ruleCatalog.repositoryRefs,
      targets: [
        {
          targetId: "delivery-src-index",
          repositoryId: aggregate.repositoryId,
          relativePath: "src/index.ts",
          language: "typescript",
          fileKind: RuleFileKind.Source,
          operation: RuleOperation.Modify,
        },
      ],
      availableValidatorIds: ["node.version"],
      availableCapabilityIds: [],
    },
    verification: {
      commandId: "delivery-completion-verification-command",
      idempotencyKey: "delivery-completion-verification-command",
      actionId: "01ARZ3NDEKTSV4RRFFQ69G5HC0",
      verificationRunId: DELIVERY_COMPLETION_VERIFICATION_RUN_ID,
      planId: "delivery-completion-plan",
      actor: { kind: ActorKind.Agent, actorId: setup.agentActorId },
      authorizationContext: {},
      submittedAt: readSubmittedAt(setup.closeoutCommand),
      failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
      runtime: { worktreeRoot: setup.worktreeRoot },
    },
  };
}

async function approveDeliveryCompletionProfile(
  context: CodingTaskSessionCloseoutCliBeforePlanningContext,
  command: VerificationCommandSpec,
): Promise<DeliveryCompletionProfileCompilation> {
  const { application, baseRevision, repositoryId, sourceTaskId, workspaceId } = context;
  const parsedRepositoryId = parseRepositoryId(repositoryId);
  if (parsedRepositoryId.status === ResultStatus.Failure) throw parsedRepositoryId.error;
  const parsedWorkspaceId = parseWorkspaceId(workspaceId);
  if (parsedWorkspaceId.status === ResultStatus.Failure) throw parsedWorkspaceId.error;
  const candidate = createCompilerCandidate(parsedRepositoryId.value, {
    workspaceId: parsedWorkspaceId.value,
    repositoryRevision: baseRevision,
  });
  const report = createCompilerReport([candidate], parsedWorkspaceId.value);
  const proposalPayload = createCompilerProposal(report, report.profileCandidates, [
    {
      checkId: "project.node-version",
      kind: VerificationKind.Build,
      requirement: VerificationRequirement.Required,
      command,
      timeoutMs: 10_000,
      retryable: false,
      selectionMode: VerificationSelectionMode.Always,
      validatorIds: ["node.version"],
    },
  ]);
  const humanActor = { kind: ActorKind.Human, actorId: "delivery-reviewer" };
  const proposed = await application.proposeArtifact.execute({
    workspaceId,
    taskId: sourceTaskId,
    actor: humanActor,
    proposal: {
      artifactType: ArtifactType.ProjectProfileProposal,
      status: ArtifactStatus.Proposed,
      payload: proposalPayload,
    },
  });
  if (proposed.status === ResultStatus.Failure) throw proposed.error;
  if (
    proposed.value.artifact.artifactType !== ArtifactType.ProjectProfileProposal ||
    proposed.value.decisionRequest === undefined
  ) {
    throw new Error("Delivery Completion E2E 未形成 G8 DecisionRequest。");
  }
  const approved = await application.recordApproval.execute({
    workspaceId,
    taskId: sourceTaskId,
    decisionRequestId: proposed.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: proposed.value.decisionRequest.digest,
    idempotencyKey: "delivery-completion-profile-approval",
    actor: humanActor,
    decision: ApprovalDecision.Approved,
  });
  if (approved.status === ResultStatus.Failure) throw approved.error;

  return {
    taskId: sourceTaskId,
    artifactId: proposed.value.artifact.artifactId,
    report,
  };
}

function readSubmittedAt(command: Record<string, unknown>): string {
  const submittedAt = command["submittedAt"];
  if (typeof submittedAt !== "string") {
    throw new Error("Closeout Command 缺少 submittedAt。");
  }
  return submittedAt;
}
