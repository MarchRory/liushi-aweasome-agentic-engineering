import { describe, expect, it, vi } from "vitest";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  CodingTaskCellService,
  CodingTaskCellStage,
  CodingTaskCellStatus,
  CodingTaskCommandType,
  CommandStatus,
  DependencyAssessmentStatus,
  FailureTaxonomy,
  GateEvaluationResult,
  HarnessError,
  HarnessErrorCode,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  PR_READY_ARTIFACT_SCHEMA_VERSION,
  RepositoryDeliveryArtifactType,
  ResultStatus,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VERIFICATION_RUN_COMMAND_TYPE,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  WORKTREE_PROVISION_COMMAND_TYPE,
  failure,
  parseArtifactId,
  parseCodingTaskId,
  parseContentDigest,
  parseRepositoryId,
  parseTaskId,
  parseWorkspaceId,
  success,
  type AssemblePrReadyArtifactUseCase,
  type CodingTaskCommandService,
  type CommandEnvelope,
  type CommandReceipt,
  type EvidenceBundle,
  type EvidenceBundleStore,
  type ImplementationCommandService,
  type ImplementationSubmissionService,
  type PrReadyArtifact,
  type VerificationCommandService,
  type WorktreeProvisionCommandService,
} from "../../src/index.js";

describe("CodingTask Cell Service", () => {
  it("按固定顺序执行多个 Implementation 并返回 ReviewReady", async () => {
    const setup = createSetup();

    const result = await setup.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.status).toBe(CodingTaskCellStatus.ReviewReady);
      expect(result.value.receipts.map(({ stage }) => stage)).toEqual([
        CodingTaskCellStage.Create,
        CodingTaskCellStage.Provision,
        CodingTaskCellStage.StartAttempt,
        CodingTaskCellStage.Implementation,
        CodingTaskCellStage.Implementation,
        CodingTaskCellStage.Submission,
        CodingTaskCellStage.Verification,
      ]);
      expect(result.value.evidenceBundle?.status).toBe(VerificationStatus.Passed);
      expect(result.value.prReadyArtifact).toBe(setup.prReadyArtifact);
    }
    expect(setup.calls).toEqual([
      "create",
      "provision",
      "start",
      "implementation-0",
      "implementation-1",
      "submission",
      "verification",
      "evidence",
      "pr_ready",
    ]);
  });

  it("Duplicate Receipt 继续后续阶段", async () => {
    const setup = createSetup({ provisionStatus: CommandStatus.Duplicate });

    const result = await setup.service.execute(createManifest());

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskCellStatus.ReviewReady },
    });
    expect(setup.calls).toEqual([
      "create",
      "provision",
      "start",
      "implementation-0",
      "implementation-1",
      "submission",
      "verification",
      "evidence",
      "pr_ready",
    ]);
  });

  it.each([CommandStatus.Rejected, CommandStatus.Conflict, CommandStatus.OutcomeUnknown])(
    "%s Receipt 立即停止且后续零调用",
    async (status) => {
      const setup = createSetup({ provisionStatus: status });

      const result = await setup.service.execute(createManifest());

      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Success) {
        expect(result.value.status).toBe(
          status === CommandStatus.OutcomeUnknown
            ? CodingTaskCellStatus.OutcomeUnknown
            : CodingTaskCellStatus.Blocked,
        );
        expect(result.value.stoppedStage).toBe(CodingTaskCellStage.Provision);
      }
      expect(setup.calls).toEqual(["create", "provision"]);
    },
  );

  it.each([VerificationStatus.Failed, VerificationStatus.Blocked])(
    "Verification Evidence %s 不宣称 ReviewReady",
    async (status) => {
      const setup = createSetup({ evidenceStatus: status });

      const result = await setup.service.execute(createManifest());

      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Success) {
        expect(result.value.status).toBe(CodingTaskCellStatus.Blocked);
        expect(result.value.stoppedStage).toBe(CodingTaskCellStage.Evidence);
        expect(result.value.evidenceBundle?.status).toBe(status);
        expect(result.value.prReadyArtifact).toBeUndefined();
      }
      expect(setup.assemblePrReady).not.toHaveBeenCalled();
    },
  );

  it("底层 Result Failure 保留 code、cause 并增加 stage", async () => {
    const cause = new Error("root cause");
    const setup = createSetup({
      provisionFailure: new HarnessError(
        HarnessErrorCode.IoFailure,
        "读取失败。",
        { path: "journal" },
        cause,
      ),
    });

    const result = await setup.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.IoFailure);
      expect(result.error.details).toEqual({
        path: "journal",
        stage: CodingTaskCellStage.Provision,
      });
      expect(result.error.cause).toBe(cause);
    }
    expect(setup.calls).toEqual(["create", "provision"]);
  });

  it("PR-ready 装配失败保留错误并停在 PrReady 阶段", async () => {
    const cause = new Error("artifact root cause");
    const setup = createSetup({
      prReadyFailure: new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "授权 Artifact 不匹配。",
        { artifactId: "plan-risk-1" },
        cause,
      ),
    });

    const result = await setup.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
      expect(result.error.details).toEqual({
        artifactId: "plan-risk-1",
        stage: CodingTaskCellStage.PrReady,
      });
      expect(result.error.cause).toBe(cause);
    }
    expect(setup.calls.at(-1)).toBe("pr_ready");
  });
});

/** Cell Service 假依赖的可选阶段结果。 */
interface SetupOptions {
  readonly provisionStatus?: CommandStatus;
  readonly provisionFailure?: HarnessError;
  readonly evidenceStatus?: VerificationStatus;
  readonly prReadyFailure?: HarnessError;
}

function createSetup(options: SetupOptions = {}) {
  const calls: string[] = [];
  const executeCodingTask = vi.fn((command: CommandEnvelope) => {
    calls.push(command.commandId);
    return Promise.resolve(success(receipt(command)));
  });
  const executeProvision = vi.fn((command: CommandEnvelope) => {
    calls.push(command.commandId);
    if (options.provisionFailure !== undefined) {
      return Promise.resolve(failure(options.provisionFailure));
    }
    return Promise.resolve(success(receipt(command, options.provisionStatus)));
  });
  const executeImplementation = vi.fn((command: CommandEnvelope) => {
    calls.push(command.commandId);
    return Promise.resolve(success(receipt(command)));
  });
  const executeSubmission = vi.fn((command: CommandEnvelope) => {
    calls.push(command.commandId);
    return Promise.resolve(success(receipt(command)));
  });
  const executeVerification = vi.fn((command: CommandEnvelope) => {
    calls.push(command.commandId);
    return Promise.resolve(success(receipt(command)));
  });
  const loadEvidence = vi.fn(() => {
    calls.push("evidence");
    return Promise.resolve(success(evidence(options.evidenceStatus ?? VerificationStatus.Passed)));
  });
  const prReadyArtifact = createPrReadyArtifact();
  const assemblePrReady = vi.fn(() => {
    calls.push("pr_ready");
    return Promise.resolve(
      options.prReadyFailure === undefined
        ? success(prReadyArtifact)
        : failure(options.prReadyFailure),
    );
  });
  return {
    calls,
    assemblePrReady,
    prReadyArtifact,
    service: new CodingTaskCellService(
      { execute: executeCodingTask } as unknown as CodingTaskCommandService,
      { execute: executeProvision } as unknown as WorktreeProvisionCommandService,
      { execute: executeImplementation } as unknown as ImplementationCommandService,
      { execute: executeSubmission } as unknown as ImplementationSubmissionService,
      { execute: executeVerification } as unknown as VerificationCommandService,
      { load: loadEvidence } as unknown as EvidenceBundleStore,
      { execute: assemblePrReady } as unknown as AssemblePrReadyArtifactUseCase,
    ),
  };
}

function receipt(
  command: CommandEnvelope,
  status: CommandStatus = CommandStatus.Committed,
): CommandReceipt {
  return {
    schemaVersion: "1.0.0",
    commandId: command.commandId,
    status,
    requestDigest: command.requestDigest,
    ...(status === CommandStatus.Committed ? { committedVersion: command.expectedVersion } : {}),
  };
}

function evidence(status: VerificationStatus): EvidenceBundle {
  return { status } as EvidenceBundle;
}

function createPrReadyArtifact(): PrReadyArtifact {
  const digest = unwrap(parseContentDigest(`sha256:${"c".repeat(64)}`));
  return {
    artifactId: "pr-ready:test",
    artifactDigest: digest,
    schemaVersion: PR_READY_ARTIFACT_SCHEMA_VERSION,
    artifactType: RepositoryDeliveryArtifactType.PrReady,
    workspaceId: unwrap(parseWorkspaceId("workspace-1")),
    repositoryId: unwrap(parseRepositoryId("repository-1")),
    codingTaskId: unwrap(parseCodingTaskId("coding-task-cell-1")),
    sourceTaskId: unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2")),
    baseRevision: "base-revision-1",
    headRevision: "target-revision-1",
    worktreeId: "worktree-1",
    branchName: "feature/cell",
    writeSet: ["src/index.ts"],
    changedPaths: ["src/index.ts"],
    diffDigest: digest,
    inputBindingSet: { bindings: [] },
    verification: {
      verificationRunId: "verification-run-1",
      planId: "plan-1",
      planDigest: digest,
      evidenceBundleDigest: digest,
      status: VerificationStatus.Passed,
    },
    authorization: {
      planRisk: {
        artifactId: unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAV")),
        artifactDigest: digest,
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
    assembledAt: "2026-07-14T00:00:00.000Z",
  };
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}

function createManifest() {
  const aggregateId = "coding-task-cell-1";
  const correlationId = "cell-correlation-1";
  const verificationPayload = {
    workspaceId: "workspace-1",
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
    verificationRunId: "verification-run-1",
    attemptNumber: 1,
    worktreeRootDigest: `sha256:${"b".repeat(64)}`,
    plan: {
      schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "plan-1",
      repositoryId: "repository-1",
      worktreeId: "worktree-1",
      expectedBranchName: "feature/cell",
      baseRevision: "base-revision-1",
      targetRevision: "target-revision-1",
      checks: [
        {
          checkId: "check-1",
          kind: VerificationKind.Typecheck,
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
    },
    failedVerificationTaxonomy: FailureTaxonomy.ImplementationDefect,
  };
  return {
    schemaVersion: CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
    createCommand: command("create", CodingTaskCommandType.Create, aggregateId, correlationId),
    provision: {
      command: command("provision", WORKTREE_PROVISION_COMMAND_TYPE, aggregateId, correlationId),
      runtime: { repositoryRoot: "C:\\repository" },
    },
    startAttemptCommand: command(
      "start",
      CodingTaskCommandType.StartAttempt,
      aggregateId,
      correlationId,
    ),
    implementations: [0, 1].map((index) => ({
      command: command(
        `implementation-${index}`,
        IMPLEMENTATION_APPLY_COMMAND_TYPE,
        aggregateId,
        correlationId,
      ),
      runtime: { repositoryRoot: "C:\\repository" },
    })),
    submission: {
      command: command(
        "submission",
        IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
        aggregateId,
        correlationId,
      ),
      runtime: { repositoryRoot: "C:\\repository" },
    },
    verification: {
      command: command(
        "verification",
        VERIFICATION_RUN_COMMAND_TYPE,
        aggregateId,
        correlationId,
        verificationPayload,
      ),
      runtime: { worktreeRoot: "C:\\repository\\worktrees\\task" },
    },
  };
}

function command(
  commandId: string,
  commandType: string,
  aggregateId: string,
  correlationId: string,
  payload: unknown = {},
): CommandEnvelope {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId,
    expectedVersion: 1,
    idempotencyKey: commandId,
    requestDigest: `sha256:${"a".repeat(64)}`,
    actor: { kind: "agent", actorId: "agent-1" },
    authorizationContext: {},
    correlationId,
    submittedAt: "2026-07-14T00:00:00.000Z",
    payload,
  } as CommandEnvelope;
}
