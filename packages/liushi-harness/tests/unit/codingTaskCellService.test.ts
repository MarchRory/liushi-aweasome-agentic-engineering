import { describe, expect, it, vi } from "vitest";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  CodingTaskCellService,
  CodingTaskCellStage,
  CodingTaskCellStatus,
  CodingTaskCommandType,
  CommandStatus,
  FailureTaxonomy,
  HarnessError,
  HarnessErrorCode,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  ResultStatus,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VERIFICATION_RUN_COMMAND_TYPE,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  WORKTREE_PROVISION_COMMAND_TYPE,
  failure,
  success,
  type CodingTaskCommandService,
  type CommandEnvelope,
  type CommandReceipt,
  type EvidenceBundle,
  type EvidenceBundleStore,
  type ImplementationCommandService,
  type ImplementationSubmissionService,
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
      }
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
});

/** Cell Service 假依赖的可选阶段结果。 */
interface SetupOptions {
  readonly provisionStatus?: CommandStatus;
  readonly provisionFailure?: HarnessError;
  readonly evidenceStatus?: VerificationStatus;
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
  return {
    calls,
    service: new CodingTaskCellService(
      { execute: executeCodingTask } as unknown as CodingTaskCommandService,
      { execute: executeProvision } as unknown as WorktreeProvisionCommandService,
      { execute: executeImplementation } as unknown as ImplementationCommandService,
      { execute: executeSubmission } as unknown as ImplementationSubmissionService,
      { execute: executeVerification } as unknown as VerificationCommandService,
      { load: loadEvidence } as unknown as EvidenceBundleStore,
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
