import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  CodingTaskCellRevisionBinding,
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
  type CodingTaskCellRuntimeBinding,
  type CodingTaskCellVerificationBindingService,
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
import {
  NodeCodingTaskCellRuntimePathAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const repositoryRoot = resolve("repository");
const otherRepositoryRoot = resolve("other-repository");
const worktreeRoot = resolve(repositoryRoot, "worktrees", "task");
const otherWorktreeRoot = resolve(repositoryRoot, "worktrees", "other-task");

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
      "verification_binding",
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
      "verification_binding",
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

  it("Template Digest 错误在 Create 前拒绝", async () => {
    const setup = createSetup();
    const manifest = createManifest();
    manifest.verification.command.requestDigest = unwrapDigest(`sha256:${"f".repeat(64)}`);

    const result = await setup.service.execute(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(setup.calls).toEqual([]);
  });

  it.each([
    {
      name: "create workspace",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.createCommand.payload = {
          ...(manifest.createCommand.payload as Record<string, unknown>),
          workspaceId: "other",
        };
        refreshCreateDigest(manifest);
      },
      stage: CodingTaskCellStage.Create,
    },
    {
      name: "create repository",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.createCommand.payload = {
          ...(manifest.createCommand.payload as Record<string, unknown>),
          repositoryId: "repository-other",
        };
        refreshCreateDigest(manifest);
      },
      stage: CodingTaskCellStage.Create,
    },
    {
      name: "provision root",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.provision.runtime.repositoryRoot = otherRepositoryRoot;
      },
      stage: CodingTaskCellStage.Provision,
    },
    {
      name: "non-first implementation root",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.implementations[1]!.runtime.repositoryRoot = otherRepositoryRoot;
      },
      stage: CodingTaskCellStage.Implementation,
    },
    {
      name: "submission root",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.submission.runtime.repositoryRoot = otherRepositoryRoot;
      },
      stage: CodingTaskCellStage.Submission,
    },
    {
      name: "verification worktree root",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.verification.runtime.worktreeRoot = otherWorktreeRoot;
      },
      stage: CodingTaskCellStage.Verification,
    },
  ])("CLI binding 与 $name 不匹配时在任何副作用前拒绝", async ({ mutate, stage }) => {
    const setup = createSetup();
    const manifest = createManifest();
    mutate(manifest);

    const result = await setup.service.execute(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
      expect(result.error.details["stage"]).toBe(stage);
    }
    expectNoServiceCalls(setup);
  });

  it.each([
    {
      name: "Create payload digest 不匹配",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.createCommand.requestDigest = unwrapDigest(`sha256:${"f".repeat(64)}`);
      },
    },
    {
      name: "Create payload 无效",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        manifest.createCommand.payload = { workspaceId: "workspace-1" };
        refreshCreateDigest(manifest);
      },
    },
    {
      name: "Create payload 声明非受管 Worktree",
      mutate: (manifest: ReturnType<typeof createManifest>) => {
        const payload = manifest.createCommand.payload as {
          worktreeBinding: { managed: boolean };
        };
        payload.worktreeBinding.managed = false;
        refreshCreateDigest(manifest);
      },
    },
  ])("$name 时在任何副作用前拒绝", async ({ mutate }) => {
    const setup = createSetup();
    const manifest = createManifest();
    mutate(manifest);

    const result = await setup.service.execute(manifest);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["stage"]).toBe(CodingTaskCellStage.Create);
    }
    expectNoServiceCalls(setup);
  });

  it("未配置 Runtime Binding 时在任何副作用前拒绝", async () => {
    const setup = createSetup({ omitRuntimeBinding: true });

    const result = await setup.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
      expect(result.error.details["stage"]).toBe(CodingTaskCellStage.Create);
    }
    expectNoServiceCalls(setup);
  });

  it("Runtime Binding 使用非规范 Repository Root 时在任何副作用前拒绝", async () => {
    const setup = createSetup({
      runtimeBinding: {
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot: "relative-repository",
      },
    });

    const result = await setup.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
      expect(result.error.details["stage"]).toBe(CodingTaskCellStage.Create);
    }
    expectNoServiceCalls(setup);
  });

  it("正确 CLI binding 保持完整 Cell 执行顺序", async () => {
    const setup = createSetup();

    const result = await setup.service.execute(createManifest());

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskCellStatus.ReviewReady },
    });
    expect(setup.calls.at(0)).toBe("create");
  });

  it("Binder 失败停在 VerificationBinding 且不调用 Verification", async () => {
    const setup = createSetup({
      bindingFailure: new HarnessError(
        HarnessErrorCode.InvalidStateTransition,
        "Revision 绑定失败。",
      ),
    });

    const result = await setup.service.execute(createManifest());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["stage"]).toBe(CodingTaskCellStage.VerificationBinding);
    }
    expect(setup.calls).toEqual([
      "create",
      "provision",
      "start",
      "implementation-0",
      "implementation-1",
      "submission",
      "verification_binding",
    ]);
    expect(setup.executeVerification).not.toHaveBeenCalled();
  });
});

/** Cell Service 假依赖的可选阶段结果。 */
interface SetupOptions {
  readonly provisionStatus?: CommandStatus;
  readonly provisionFailure?: HarnessError;
  readonly evidenceStatus?: VerificationStatus;
  readonly prReadyFailure?: HarnessError;
  readonly bindingFailure?: HarnessError;
  readonly omitRuntimeBinding?: boolean;
  readonly runtimeBinding?: CodingTaskCellRuntimeBinding;
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
  const bindVerification = vi.fn(
    (input: { readonly command: CommandEnvelope<Record<string, unknown>> }) => {
      calls.push("verification_binding");
      if (options.bindingFailure !== undefined) {
        return Promise.resolve(failure(options.bindingFailure));
      }
      const payload = input.command.payload as ReturnType<typeof verificationPayload>;
      const materializedPayload = {
        ...payload,
        plan: { ...payload.plan, targetRevision: "target-revision-1" },
      };
      return Promise.resolve(
        success({
          ...input.command,
          requestDigest: unwrapDigest(calculateDigest(materializedPayload)),
          payload: materializedPayload,
        }),
      );
    },
  );
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
    executeVerification,
    prReadyArtifact,
    service: new CodingTaskCellService(
      { execute: executeCodingTask } as unknown as CodingTaskCommandService,
      { execute: executeProvision } as unknown as WorktreeProvisionCommandService,
      { execute: executeImplementation } as unknown as ImplementationCommandService,
      { execute: executeSubmission } as unknown as ImplementationSubmissionService,
      { bind: bindVerification } as unknown as CodingTaskCellVerificationBindingService,
      { execute: executeVerification } as unknown as VerificationCommandService,
      { load: loadEvidence } as unknown as EvidenceBundleStore,
      { execute: assemblePrReady } as unknown as AssemblePrReadyArtifactUseCase,
      digest,
      new NodeCodingTaskCellRuntimePathAdapter(),
      options.omitRuntimeBinding === true
        ? undefined
        : (options.runtimeBinding ?? {
            workspaceId: "workspace-1",
            repositoryId: "repository-1",
            repositoryRoot,
          }),
    ),
    serviceMocks: [
      executeCodingTask,
      executeProvision,
      executeImplementation,
      executeSubmission,
      bindVerification,
      executeVerification,
      loadEvidence,
      assemblePrReady,
    ],
  };
}

function expectNoServiceCalls(setup: ReturnType<typeof createSetup>): void {
  for (const serviceMock of setup.serviceMocks) {
    expect(serviceMock).not.toHaveBeenCalled();
  }
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
  const verificationPayloadValue = verificationPayload();
  return {
    schemaVersion: CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
    createCommand: command("create", CodingTaskCommandType.Create, aggregateId, correlationId, {
      workspaceId: "workspace-1",
      sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
      repositoryId: "repository-1",
      baseRevision: "base-revision-1",
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/cell",
        managed: true,
      },
      writeSet: ["src/index.ts"],
      inputBindingSet: { bindings: [] },
      executionAuthorization: {
        planRisk: {
          artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          artifactDigest: `sha256:${"1".repeat(64)}`,
          result: GateEvaluationResult.Allow,
          requiredGates: [],
          satisfiedApprovalIds: [],
        },
        historicalLogicChange: false,
      },
    }),
    provision: {
      command: command("provision", WORKTREE_PROVISION_COMMAND_TYPE, aggregateId, correlationId),
      runtime: { repositoryRoot },
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
      runtime: { repositoryRoot },
    })),
    submission: {
      command: command(
        "submission",
        IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
        aggregateId,
        correlationId,
      ),
      runtime: { repositoryRoot },
    },
    verification: {
      command: command(
        "verification",
        VERIFICATION_RUN_COMMAND_TYPE,
        aggregateId,
        correlationId,
        verificationPayloadValue,
      ),
      binding: CodingTaskCellRevisionBinding.LatestImplementationCheckpoint,
      runtime: { worktreeRoot },
    },
  };
}

function refreshCreateDigest(manifest: ReturnType<typeof createManifest>): void {
  manifest.createCommand.requestDigest = unwrapDigest(
    calculateDigest(manifest.createCommand.payload),
  );
}

function verificationPayload() {
  return {
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
    requestDigest: unwrapDigest(calculateDigest(payload)),
    actor: { kind: "agent", actorId: "agent-1" },
    authorizationContext: {},
    correlationId,
    submittedAt: "2026-07-14T00:00:00.000Z",
    payload,
  } as CommandEnvelope;
}

function calculateDigest(value: unknown): string {
  const result = digest.calculate(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function unwrapDigest(value: string) {
  return unwrap(parseContentDigest(value));
}
