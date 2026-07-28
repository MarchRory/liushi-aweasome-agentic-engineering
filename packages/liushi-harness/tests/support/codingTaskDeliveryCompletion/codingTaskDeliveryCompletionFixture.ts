import { vi } from "vitest";

import {
  CodingTaskDeliveryCompletionService,
  CommandErrorCode,
  CommandStatus,
  createCommandReceipt,
} from "../../../src/application/index.js";
import {
  CODING_TASK_VERIFICATION_COMPLETION_REPORT_SCHEMA_VERSION,
  CodingTaskVerificationCompletionStatus,
  type CodingTaskVerificationCompletionInput,
} from "../../../src/application/codingTaskVerificationCompletion/index.js";
import type { CodingTaskRepository } from "../../../src/application/ports/index.js";
import {
  ActorKind,
  ResultStatus,
  success,
  type HarnessError,
  type Result,
} from "../../../src/common/index.js";
import type { ProjectProfileBundle } from "../../../src/domain/projectProfile/index.js";
import type { ApplicableRuleBundle } from "../../../src/domain/rule/index.js";
import { FailureTaxonomy } from "../../../src/domain/workflow/index.js";
import {
  compilerProvenance,
  compilerRepoA,
  createCompilerCandidate,
  createCompilerReport,
} from "../profileCompile/index.js";
import {
  createDeliveryAggregate,
  createDeliveryCommand,
  createDeliveryEvidenceBundle,
  createDeliveryPlanSelection,
  createDeliveryPrReadyArtifact,
  createDeliveryRuleContext,
  deliveryCompletionDigest,
  deliveryCompletionRepositoryRoot,
  deliveryCompletionWorktreeRoot,
} from "./codingTaskDeliveryCompletionAuthorityFixture.js";

export { deliveryCompletionWorktreeRoot };

/** Delivery Completion 单元测试使用的完整夹具。 */
type DeliveryCompletionSetup = ReturnType<typeof buildDeliveryCompletionSetup>;

/** 创建 Delivery Completion 编排测试所需的最小权威夹具。 */
export function createDeliveryCompletionSetup(
  deliveryStatus = CommandStatus.Committed,
): DeliveryCompletionSetup {
  return buildDeliveryCompletionSetup(deliveryStatus);
}

function buildDeliveryCompletionSetup(deliveryStatus: CommandStatus) {
  const aggregate = createDeliveryAggregate();
  const deliveryCommand = createDeliveryCommand(aggregate);
  const deliveryReceipt = unwrap(
    createCommandReceipt({
      commandId: deliveryCommand.commandId,
      requestDigest: deliveryCommand.requestDigest,
      status: deliveryStatus,
      ...(deliveryStatus === CommandStatus.Committed
        ? { committedVersion: aggregate.version }
        : deliveryStatus === CommandStatus.OutcomeUnknown
          ? {
              errorCode: CommandErrorCode.OutcomeUnknown,
              errorMessage: "测试注入 Delivery OutcomeUnknown。",
            }
          : {}),
    }),
  );
  const deliverySubmission = vi.fn(() => Promise.resolve(success(deliveryReceipt)));
  const codingTaskLoad = vi.fn(() =>
    Promise.resolve(
      success({ aggregate, lastSequence: aggregate.version, lastEventHash: "event-hash" }),
    ),
  );
  const codingTaskRepository: CodingTaskRepository = {
    load: codingTaskLoad,
    append: () => Promise.reject(new Error("测试不允许追加 CodingTask Event。")),
  };
  const report = createCompilerReport([createCompilerCandidate(compilerRepoA)]);
  const selection = createDeliveryPlanSelection(aggregate);
  const evidenceBundle = createDeliveryEvidenceBundle(selection);
  const prReadyArtifact = createDeliveryPrReadyArtifact(aggregate, evidenceBundle);
  const verificationCompletion = vi.fn((input: CodingTaskVerificationCompletionInput) =>
    Promise.resolve(
      success({
        schemaVersion: CODING_TASK_VERIFICATION_COMPLETION_REPORT_SCHEMA_VERSION,
        status: CodingTaskVerificationCompletionStatus.ReviewReady,
        receipt: unwrap(
          createCommandReceipt({
            commandId: input.command.commandId,
            requestDigest: input.command.requestDigest,
            status: CommandStatus.Committed,
            committedVersion: aggregate.version + 1,
          }),
        ),
        evidenceBundle,
        prReadyArtifact,
      }),
    ),
  );
  const managedWorktreePath = {
    resolveManagedWorktreeRoot: vi.fn(() => success(deliveryCompletionWorktreeRoot)),
    hasSamePathIdentity: vi.fn((left: string, right: string) => left === right),
  };
  const input = {
    deliveryCommand,
    profileCompilation: {
      taskId: compilerProvenance.taskId,
      artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
      report,
    },
    ruleResolutionContext: createDeliveryRuleContext(aggregate),
    verification: {
      commandId: "verification-command-1",
      idempotencyKey: "verification-command-1",
      actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC0",
      verificationRunId: "verification-run-1",
      planId: selection.plan.planId,
      actor: { kind: ActorKind.Agent, actorId: "agent-1" },
      authorizationContext: {},
      submittedAt: "2026-07-28T00:00:00.000Z",
      failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
      runtime: { worktreeRoot: deliveryCompletionWorktreeRoot },
    },
  };
  const service = new CodingTaskDeliveryCompletionService(
    { execute: deliverySubmission },
    codingTaskRepository,
    { execute: vi.fn(() => Promise.resolve(success({} as ProjectProfileBundle))) },
    { execute: vi.fn(() => success({} as ApplicableRuleBundle)) },
    { execute: vi.fn(() => success(selection)) },
    {
      resolve: vi.fn(() =>
        Promise.resolve(success({ repositoryRoot: deliveryCompletionRepositoryRoot })),
      ),
    },
    managedWorktreePath,
    { execute: verificationCompletion },
    deliveryCompletionDigest,
  );
  return {
    aggregate,
    codingTaskLoad,
    codingTaskRepository,
    deliverySubmission,
    input,
    managedWorktreePath,
    service,
    verificationCompletion,
  };
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
