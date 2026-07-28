import { describe, expect, it } from "vitest";

import {
  ResolveRulesUseCase,
  SelectVerificationPlanUseCase,
  type SelectVerificationPlanInput,
} from "../../src/application/index.js";
import {
  CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  ResultStatus,
  type HarnessError,
  type Result,
} from "../../src/common/index.js";
import { parseArtifactDigest, parseArtifactId } from "../../src/domain/artifact/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  parseCodingTaskId,
  type CodingTaskAggregate,
} from "../../src/domain/codingTask/index.js";
import { GateEvaluationResult } from "../../src/domain/policy/index.js";
import { compileProjectProfileBundle } from "../../src/domain/projectProfile/index.js";
import {
  RuleFileKind,
  RuleOperation,
  createApplicableRuleBundleDigestInput,
  type ApplicableRuleBundle,
} from "../../src/domain/rule/index.js";
import {
  VerificationImpactDiagnosticCode,
  VerificationImpactSelectionStatus,
} from "../../src/domain/verification/index.js";
import { FailureTaxonomy } from "../../src/domain/workflow/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";
import {
  compilerProvenance,
  compilerRepoA,
  createCompilerCandidate,
  createCompilerProposal,
  createCompilerReport,
} from "../support/profileCompile/index.js";

const digest = new Rfc8785Sha256DigestAdapter();

describe("SelectVerificationPlanUseCase", () => {
  it("从完整权威输入生成绑定当前实现 Revision 的 Verification Plan", () => {
    const input = createInput();
    const result = new SelectVerificationPlanUseCase(digest).execute(input);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toMatchObject({
        status: VerificationImpactSelectionStatus.Ready,
        plan: {
          planId: "plan-1",
          repositoryId: input.codingTask.repositoryId,
          worktreeId: input.codingTask.worktreeBinding.worktreeId,
          expectedBranchName: input.codingTask.worktreeBinding.branchName,
          baseRevision: input.codingTask.baseRevision,
          targetRevision: input.codingTask.attempts[0]?.targetRevision,
        },
        sourceRefs: {
          projectProfileBundleDigest: input.profileBundle.digest,
          applicableRuleBundleDigest: input.ruleBundle.digest,
        },
      });
      if (result.value.status === VerificationImpactSelectionStatus.Ready) {
        expect(result.value.plan.checks.map((check) => check.checkId)).toEqual([
          "project.typecheck",
        ]);
      }
    }
  });

  it("Rule Target 未覆盖权威 Changed Paths 时返回可解释 Blocked 结果", () => {
    const input = createInput();
    const ruleBundle = withRuleBundleDigest({
      ...input.ruleBundle,
      targets: input.ruleBundle.targets.map((target) => ({
        ...target,
        relativePath: "src/other.ts",
      })),
    });
    const result = new SelectVerificationPlanUseCase(digest).execute({ ...input, ruleBundle });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.status).toBe(VerificationImpactSelectionStatus.Blocked);
      expect(result.value.selection.diagnostics[0]?.code).toBe(
        VerificationImpactDiagnosticCode.RuleTargetCoverageIncomplete,
      );
      expect("plan" in result.value).toBe(false);
    }
  });

  it("Project Profile Bundle Digest 漂移时拒绝生成选择结果", () => {
    const input = createInput();
    const result = new SelectVerificationPlanUseCase(digest).execute({
      ...input,
      profileBundle: {
        ...input.profileBundle,
        workspaceGraphRevision: "graph-rev-drift",
      },
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("Applicable Rule Bundle Digest 漂移时拒绝生成选择结果", () => {
    const input = createInput();
    const result = new SelectVerificationPlanUseCase(digest).execute({
      ...input,
      ruleBundle: {
        ...input.ruleBundle,
        targets: input.ruleBundle.targets.map((target) => ({
          ...target,
          relativePath: "src/drift.ts",
        })),
      },
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("Attempt 未形成完整 ImplementationSubmitted 事实时关闭式拒绝", () => {
    const input = createInput();
    const attempt = input.codingTask.attempts[0]!;
    const result = new SelectVerificationPlanUseCase(digest).execute({
      ...input,
      codingTask: {
        ...input.codingTask,
        attempts: [{ ...attempt, outcome: CodingTaskAttemptOutcome.OutcomeUnknown }],
      },
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("已通过 Verification 的完成态可确定性重建同一 Plan", () => {
    const input = createInput();
    const original = new SelectVerificationPlanUseCase(digest).execute(input);
    const completed = new SelectVerificationPlanUseCase(digest).execute({
      ...input,
      codingTask: {
        ...input.codingTask,
        runState: CodingTaskRunState.Completed,
        attempts: input.codingTask.attempts.map((attempt) => ({
          ...attempt,
          verificationOutcome: CodingTaskVerificationOutcome.Passed,
        })),
      },
    });

    expect(original.status).toBe(ResultStatus.Success);
    expect(completed).toEqual(original);
  });

  it("Verification 失败后的实现态可确定性重建同一 Plan", () => {
    const input = createInput();
    const original = new SelectVerificationPlanUseCase(digest).execute(input);
    const failed = new SelectVerificationPlanUseCase(digest).execute({
      ...input,
      codingTask: {
        ...input.codingTask,
        phase: CodingTaskPhase.Implementation,
        runState: CodingTaskRunState.Active,
        attempts: input.codingTask.attempts.map((attempt) => ({
          ...attempt,
          verificationOutcome: CodingTaskVerificationOutcome.Failed,
          verificationFailureTaxonomy: FailureTaxonomy.ImplementationDefect,
        })),
      },
    });

    expect(original.status).toBe(ResultStatus.Success);
    expect(failed).toEqual(original);
  });
});

function createInput(): SelectVerificationPlanInput {
  const report = createCompilerReport([createCompilerCandidate(compilerRepoA)]);
  const profileBundle = unwrap(
    compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: createCompilerProposal(report),
        provenance: { ...compilerProvenance, revision: 1 },
      },
      digest,
    ),
  );
  const profile = profileBundle.profiles[0]!;
  const codingTask = createCodingTask(profile.repositoryRevision);
  const ruleBundle = unwrap(
    new ResolveRulesUseCase(digest).execute({
      catalog: profileBundle.ruleCatalog,
      context: {
        taskId: codingTask.sourceTaskId,
        workspaceRef: profileBundle.ruleCatalog.workspaceRef,
        repositoryRefs: profileBundle.ruleCatalog.repositoryRefs,
        targets: [
          {
            targetId: "target-src-example",
            repositoryId: codingTask.repositoryId,
            relativePath: "src/example.ts",
            language: "typescript",
            fileKind: RuleFileKind.Source,
            operation: RuleOperation.Modify,
          },
        ],
        availableValidatorIds: [],
        availableCapabilityIds: [],
      },
    }),
  );
  return { profileBundle, codingTask, attemptNumber: 1, ruleBundle, planId: "plan-1" };
}

function createCodingTask(baseRevision: string): CodingTaskAggregate {
  return {
    schemaVersion: CODING_TASK_AGGREGATE_SCHEMA_VERSION,
    codingTaskId: unwrap(parseCodingTaskId("coding-task-1")),
    workspaceId: compilerProvenance.workspaceId,
    sourceTaskId: compilerProvenance.taskId,
    repositoryId: compilerRepoA,
    baseRevision,
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: ".worktrees/coding-task-1",
      branchName: "feature/verification-impact",
      managed: true,
    },
    writeSet: ["src/example.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FAT")),
        artifactDigest: unwrap(parseArtifactDigest(`sha256:${"1".repeat(64)}`)),
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
        startedAt: "2026-07-13T00:00:00.000Z",
        finishedAt: "2026-07-13T00:01:00.000Z",
        outcome: CodingTaskAttemptOutcome.Succeeded,
        targetRevision: "target-revision-1",
        changedPaths: ["src/example.ts"],
      },
    ],
    version: 3,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:01:00.000Z",
  };
}

function withRuleBundleDigest(bundle: ApplicableRuleBundle): ApplicableRuleBundle {
  const calculated = digest.calculate(createApplicableRuleBundleDigestInput(bundle));
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return { ...bundle, digest: calculated.value };
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
