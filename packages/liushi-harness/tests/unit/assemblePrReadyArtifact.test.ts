import { describe, expect, it, vi } from "vitest";

import { AssemblePrReadyArtifactUseCase } from "#application/useCases/assemblePrReadyArtifact/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  EvidenceBundleStore,
  TaskRepository,
} from "#application/ports/index.js";
import {
  ActorKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
} from "#common/index.js";
import {
  ArtifactStatus,
  ArtifactType,
  parseArtifactId,
  type BusinessLogicChangeContractArtifact,
  type PlanRiskArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  parseCodingTaskId,
  type CodingTaskAggregate,
} from "#domain/codingTask/index.js";
import { EvidenceKind } from "#domain/evidence/index.js";
import { GateEvaluationResult, RiskLevel } from "#domain/policy/index.js";
import {
  DependencyAssessmentStatus,
  RepositoryDeliveryArtifactType,
} from "#domain/repositoryDelivery/index.js";
import { parseTaskId, TaskPhase, TaskRunState } from "#domain/task/index.js";
import { TaskCheckpoint, type TaskAggregateRecord } from "#domain/taskRun/index.js";
import {
  VerificationFailureKind,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  type EvidenceBundle,
} from "#domain/verification/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";
import { Rfc8785Sha256DigestAdapter } from "#infrastructure/serialization/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const workspaceId = unwrap(parseWorkspaceId("pr-ready-workspace"));
const repositoryId = unwrap(parseRepositoryId("repo-1"));
const codingTaskId = unwrap(parseCodingTaskId("coding-task-pr-ready"));
const sourceTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FB2"));
const planRiskArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAV"));
const businessLogicArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FB0"));
const planRiskDigest = calculateDigest({ artifact: "plan-risk" });
const businessLogicDigest = calculateDigest({ artifact: "business-logic" });
const outputDigest = calculateDigest({ output: "passed" });

describe("AssemblePrReadyArtifactUseCase", () => {
  it("对相同权威输入生成确定性的 PR-ready Artifact", async () => {
    const setup = createSetup();

    const first = await setup.useCase.execute(input());
    const second = await setup.createUseCase().execute(input());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: {
        artifactType: RepositoryDeliveryArtifactType.PrReady,
        workspaceId,
        repositoryId,
        codingTaskId,
        sourceTaskId,
        baseRevision: "base-revision",
        headRevision: "head-revision",
        worktreeId: "worktree-1",
        branchName: "feature/pr-ready",
        verification: { status: VerificationStatus.Passed },
        dependencyAssessment: {
          status: DependencyAssessmentStatus.NotAssessed,
          changes: [],
        },
        assembledAt: "2026-07-14T00:00:03.000Z",
      },
    });
    if (first.status === ResultStatus.Success) {
      expect(first.value.artifactId).toBe(
        `pr-ready:${first.value.artifactDigest.slice("sha256:".length)}`,
      );
    }
    expect(setup.evidenceLoad).toHaveBeenCalledTimes(2);
    expect(setup.evidenceLoad).toHaveBeenLastCalledWith(input());
  });

  it("拒绝尚未完成的 CodingTask Aggregate", async () => {
    const setup = createSetup({
      aggregate: codingTaskAggregate({ runState: CodingTaskRunState.Active }),
    });

    const result = await setup.useCase.execute(input());

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidStateTransition },
    });
    expect(setup.taskLoad).not.toHaveBeenCalled();
  });

  it.each([
    ["failed", failedEvidence(), HarnessErrorCode.InvalidStateTransition],
    [
      "repository mismatch",
      evidenceBundle({ repositoryId: unwrap(parseRepositoryId("repo-2")) }),
      HarnessErrorCode.InvalidInput,
    ],
    [
      "target mismatch",
      evidenceBundle({ targetRevision: "other-revision" }),
      HarnessErrorCode.InvalidInput,
    ],
    [
      "verification run mismatch",
      evidenceBundle({ verificationRunId: "other-verification-run" }),
      HarnessErrorCode.InvalidInput,
    ],
    [
      "plan digest mismatch",
      evidenceBundle({ planDigest: calculateDigest({ plan: "other-plan" }) }),
      HarnessErrorCode.InvalidInput,
    ],
  ])("拒绝 Evidence %s", async (_caseName, evidenceBundleInput, errorCode) => {
    const result = await createSetup({ evidence: evidenceBundleInput }).useCase.execute(input());

    expect(result).toMatchObject({ status: ResultStatus.Failure, error: { code: errorCode } });
  });

  it("拒绝 PlanRisk Artifact Digest 不匹配", async () => {
    const aggregate = codingTaskAggregate({
      planRiskArtifactDigest: calculateDigest({ artifact: "other-plan-risk" }),
    });

    const result = await createSetup({ aggregate }).useCase.execute(input());

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("历史业务逻辑变更仅接受精确且 allow 的 BusinessLogic Binding", async () => {
    const planRisk = planRiskArtifact({ historicalLogicChange: true });
    const aggregate = codingTaskAggregate({ historicalLogicChange: true });

    const result = await createSetup({
      aggregate,
      artifacts: [planRisk, businessLogicArtifact()],
    }).useCase.execute(input());

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        authorization: {
          historicalLogicChange: true,
          businessLogic: {
            artifactId: businessLogicArtifactId,
            artifactDigest: businessLogicDigest,
            result: GateEvaluationResult.Allow,
          },
        },
      },
    });
  });

  it("历史业务逻辑变更缺少精确 BusinessLogic Artifact 时 fail closed", async () => {
    const planRisk = planRiskArtifact({ historicalLogicChange: true });
    const aggregate = codingTaskAggregate({ historicalLogicChange: true });

    const result = await createSetup({ aggregate, artifacts: [planRisk] }).useCase.execute(input());

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("保守且按权威顺序精确复制全部风险、风险操作和回滚方案", async () => {
    const planRisk = planRiskArtifact();

    const result = await createSetup({ artifacts: [planRisk] }).useCase.execute(input());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.remainingRisks).toBe(planRisk.payload.risks);
    expect(result.value.riskOperations).toBe(planRisk.payload.riskOperations);
    expect(result.value.rollbackPlan).toBe(planRisk.payload.rollbackPlan);
    expect(result.value.remainingRisks).toEqual([
      { description: "risk-z", mitigation: "mitigate-z" },
      { description: "risk-a", mitigation: "mitigate-a" },
    ]);
  });

  it("Artifact、Diff 与 Evidence Digest 均可由冻结输入重算", async () => {
    const evidence = evidenceBundle();
    const result = await createSetup({ evidence }).useCase.execute(input());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    const artifact = result.value;
    const { artifactId, artifactDigest, ...body } = artifact;
    expect(artifactId).toBe(`pr-ready:${artifactDigest.slice("sha256:".length)}`);
    expect(artifact.diffDigest).toBe(
      calculateDigest({
        baseRevision: artifact.baseRevision,
        headRevision: artifact.headRevision,
        changedPaths: artifact.changedPaths,
      }),
    );
    expect(artifact.verification.evidenceBundleDigest).toBe(calculateDigest(evidence));
    expect(artifactDigest).toBe(calculateDigest(body));
  });

  it("严格拒绝调用方注入 Evidence 或自报 Revision", async () => {
    const setup = createSetup();
    const result = await setup.useCase.execute({
      ...input(),
      evidenceBundle: evidenceBundle(),
      headRevision: "caller-revision",
    } as Parameters<AssemblePrReadyArtifactUseCase["execute"]>[0]);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(setup.codingTaskLoad).not.toHaveBeenCalled();
    expect(setup.evidenceLoad).not.toHaveBeenCalled();
  });

  it("原样传递 Repository Store 错误", async () => {
    const storeError = new HarnessError(HarnessErrorCode.IoFailure, "store failed");
    const result = await createSetup({ codingTaskFailure: storeError }).useCase.execute(input());

    expect(result).toEqual(failure(storeError));
  });

  it("原样传递 EvidenceBundle Store 错误", async () => {
    const storeError = new HarnessError(HarnessErrorCode.IoFailure, "evidence store failed");
    const setup = createSetup({ evidenceFailure: storeError });

    const result = await setup.useCase.execute(input());

    expect(result).toEqual(failure(storeError));
    expect(setup.taskLoad).not.toHaveBeenCalled();
  });

  it("使用权威身份、Write Set 与缓存授权重新调用 Resolver", async () => {
    const aggregate = codingTaskAggregate();
    const setup = createSetup({ aggregate });

    const result = await setup.useCase.execute(input());

    expect(result.status).toBe(ResultStatus.Success);
    expect(setup.resolveAuthorization).toHaveBeenCalledWith({
      sourceTaskId,
      workspaceId,
      repositoryId,
      writeSet: aggregate.writeSet,
      requested: aggregate.executionAuthorization,
    });
  });

  it.each(["resolver rejected", "write set recheck failed", "approval recheck failed"])(
    "Resolver 拒绝 %s 时原样 fail closed",
    async (message) => {
      const resolverError = new HarnessError(HarnessErrorCode.OperationForbidden, message);
      const setup = createSetup({ resolverFailure: resolverError });

      const result = await setup.useCase.execute(input());

      expect(result).toEqual(failure(resolverError));
      expect(setup.taskLoad).not.toHaveBeenCalled();
    },
  );
});

/** Unit Test 可注入的权威状态与 Store 故障。 */
interface SetupOptions {
  readonly aggregate?: CodingTaskAggregate;
  readonly artifacts?: readonly SupportedArtifact[];
  readonly codingTaskFailure?: HarnessError;
  readonly evidence?: EvidenceBundle;
  readonly evidenceFailure?: HarnessError;
  readonly resolverFailure?: HarnessError;
}

function createSetup(options: SetupOptions = {}) {
  const aggregate = options.aggregate ?? codingTaskAggregate();
  const codingTaskLoad = vi.fn(() =>
    Promise.resolve(
      options.codingTaskFailure === undefined
        ? success({ aggregate, lastSequence: 5, lastEventHash: "coding-task-hash" })
        : failure(options.codingTaskFailure),
    ),
  );
  const taskLoad = vi.fn(() =>
    Promise.resolve(success(taskRecord(options.artifacts ?? [planRiskArtifact()]))),
  );
  const evidenceLoad = vi.fn(() =>
    Promise.resolve(
      options.evidenceFailure === undefined
        ? success(options.evidence ?? evidenceBundle())
        : failure(options.evidenceFailure),
    ),
  );
  const codingTaskRepository = { load: codingTaskLoad } as unknown as CodingTaskRepository;
  const taskRepository = { load: taskLoad } as unknown as TaskRepository;
  const evidenceBundleStore = { load: evidenceLoad } as unknown as EvidenceBundleStore;
  const resolveAuthorization = vi.fn(() =>
    Promise.resolve(
      options.resolverFailure === undefined
        ? success(aggregate.executionAuthorization)
        : failure(options.resolverFailure),
    ),
  );
  const authorizationResolver = {
    resolve: resolveAuthorization,
  } as CodingTaskExecutionAuthorizationResolver;
  const createUseCase = () =>
    new AssemblePrReadyArtifactUseCase(
      codingTaskRepository,
      taskRepository,
      authorizationResolver,
      evidenceBundleStore,
      digest,
    );
  return {
    codingTaskLoad,
    taskLoad,
    evidenceLoad,
    resolveAuthorization,
    createUseCase,
    useCase: createUseCase(),
  };
}

/** CodingTask Aggregate Fixture 的可覆盖权威字段。 */
interface CodingTaskOverrides {
  readonly runState?: CodingTaskRunState;
  readonly planRiskArtifactDigest?: ReturnType<typeof calculateDigest>;
  readonly historicalLogicChange?: boolean;
}

function codingTaskAggregate(overrides: CodingTaskOverrides = {}): CodingTaskAggregate {
  const historicalLogicChange = overrides.historicalLogicChange ?? false;
  return {
    schemaVersion: "1.0.0",
    codingTaskId,
    workspaceId,
    sourceTaskId,
    repositoryId,
    baseRevision: "base-revision",
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: "worktrees/pr-ready",
      branchName: "feature/pr-ready",
      managed: true,
    },
    writeSet: ["src/z.ts", "src/a.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: planRiskArtifactId,
        artifactDigest: overrides.planRiskArtifactDigest ?? planRiskDigest,
        result: GateEvaluationResult.Allow,
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange,
      ...(historicalLogicChange
        ? {
            businessLogic: {
              artifactId: businessLogicArtifactId,
              artifactDigest: businessLogicDigest,
              result: GateEvaluationResult.Allow,
              requiredGates: [],
              satisfiedApprovalIds: [],
            },
          }
        : {}),
    },
    phase: CodingTaskPhase.Verification,
    runState: overrides.runState ?? CodingTaskRunState.Completed,
    attempts: [
      {
        number: 1,
        startedAt: "2026-07-14T00:00:00.000Z",
        finishedAt: "2026-07-14T00:00:01.000Z",
        outcome: CodingTaskAttemptOutcome.Succeeded,
        targetRevision: "head-revision",
        changedPaths: ["src/z.ts", "src/a.ts"],
        verificationOutcome: CodingTaskVerificationOutcome.Passed,
      },
    ],
    version: 5,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:03.000Z",
  };
}

/** PlanRisk Fixture 的历史逻辑声明覆盖。 */
interface PlanRiskOverrides {
  readonly historicalLogicChange?: boolean;
}

function planRiskArtifact(overrides: PlanRiskOverrides = {}): PlanRiskArtifact {
  const historicalLogicChange = overrides.historicalLogicChange ?? false;
  return {
    schemaVersion: "1.0.0",
    artifactId: planRiskArtifactId,
    artifactType: ArtifactType.PlanRisk,
    workspaceId,
    taskId: sourceTaskId,
    revision: 1,
    status: ArtifactStatus.Approved,
    createdAt: "2026-07-14T00:00:00.000Z",
    createdBy: { kind: ActorKind.Human, actorId: "human" },
    digest: planRiskDigest,
    payload: {
      steps: [],
      readSet: [],
      writeSet: ["src/z.ts", "src/a.ts"],
      risks: [
        { description: "risk-z", mitigation: "mitigate-z" },
        { description: "risk-a", mitigation: "mitigate-a" },
      ],
      riskLevel: RiskLevel.R1,
      historicalLogicChange,
      riskOperations: [
        { target: "operation-z", reason: "reason-z" },
        { target: "operation-a", reason: "reason-a" },
      ],
      testPlan: ["run tests"],
      rollbackPlan: ["rollback-z", "rollback-a"],
      requiredGates: [],
      ...(historicalLogicChange ? { businessLogicArtifactDigest: businessLogicDigest } : {}),
    },
  };
}

function businessLogicArtifact(): BusinessLogicChangeContractArtifact {
  return {
    schemaVersion: "1.0.0",
    artifactId: businessLogicArtifactId,
    artifactType: ArtifactType.BusinessLogicChangeContract,
    workspaceId,
    taskId: sourceTaskId,
    revision: 1,
    status: ArtifactStatus.Approved,
    createdAt: "2026-07-14T00:00:00.000Z",
    createdBy: { kind: ActorKind.Human, actorId: "human" },
    digest: businessLogicDigest,
    payload: {
      currentBehavior: { facts: [], inferences: [] },
      plannedBehavior: [],
      differences: [],
      affectedConsumers: [],
      invariants: [],
      rollback: [],
      evidence: [],
      unknowns: [],
    },
  };
}

function taskRecord(artifacts: readonly SupportedArtifact[]): TaskAggregateRecord {
  return {
    aggregate: {
      task: {
        schemaVersion: "1.0.0",
        taskId: sourceTaskId,
        workspaceId,
        phase: TaskPhase.Implementation,
        runState: TaskRunState.Running,
        createdBy: { kind: ActorKind.Human, actorId: "human" },
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
      checkpoint: TaskCheckpoint.ImplementationReady,
      artifacts,
      approvals: [],
    },
    lastSequence: 3,
    lastEventHash: "task-hash",
  };
}

function input() {
  return {
    workspaceId,
    codingTaskId,
    verificationRunId: "verification-run-1",
    expectedPlanDigest: calculateDigest({ plan: "verification-plan-1" }),
  };
}

/** Evidence Fixture 的权威身份覆盖。 */
interface EvidenceOverrides {
  readonly repositoryId?: typeof repositoryId;
  readonly targetRevision?: string;
  readonly verificationRunId?: string;
  readonly planDigest?: EvidenceBundle["planDigest"];
}

function evidenceBundle(overrides: EvidenceOverrides = {}): EvidenceBundle {
  const targetRevision = overrides.targetRevision ?? "head-revision";
  return {
    schemaVersion: 1,
    verificationRunId: overrides.verificationRunId ?? "verification-run-1",
    planId: "verification-plan-1",
    repositoryId: overrides.repositoryId ?? repositoryId,
    worktreeId: "worktree-1",
    baseRevision: "base-revision",
    targetRevision,
    planDigest: overrides.planDigest ?? calculateDigest({ plan: "verification-plan-1" }),
    status: VerificationStatus.Passed,
    generatedAt: "2026-07-14T00:00:02.000Z",
    checks: [
      {
        checkId: "unit",
        kind: VerificationKind.UnitTest,
        requirement: VerificationRequirement.Required,
        status: VerificationStatus.Passed,
        exitCode: 0,
        outputDigest,
        startedAt: "2026-07-14T00:00:00.000Z",
        completedAt: "2026-07-14T00:00:01.000Z",
        evidence: {
          evidenceId: "verification-run-1.unit",
          kind: EvidenceKind.Test,
          source: "unit-test",
          title: "Unit test",
          revision: targetRevision,
          observedAt: "2026-07-14T00:00:01.000Z",
          contentDigest: outputDigest,
        },
      },
    ],
  };
}

function failedEvidence(): EvidenceBundle {
  const passed = evidenceBundle();
  return {
    ...passed,
    status: VerificationStatus.Failed,
    checks: passed.checks.map((check) => ({
      ...check,
      status: VerificationStatus.Failed,
      failureKind: VerificationFailureKind.CommandFailed,
      exitCode: 1,
    })),
  };
}

function calculateDigest(value: unknown) {
  return unwrap(digest.calculate(value));
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
