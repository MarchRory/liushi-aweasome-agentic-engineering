import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  ApprovalDecision,
  ActorKind,
  ArtifactStatus,
  ArtifactType,
  CodingTaskCellStage,
  CodingTaskCellStatus,
  CodingTaskCommandType,
  DependencyAssessmentStatus,
  FailureTaxonomy,
  FileMutationKind,
  GateEvaluationResult,
  IMPLEMENTATION_APPLY_COMMAND_TYPE,
  IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
  ResultStatus,
  RiskLevel,
  VERIFICATION_RUN_COMMAND_TYPE,
  VerificationExecutionMode,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
  WORKTREE_PROVISION_COMMAND_TYPE,
  createHarnessApplication,
  type CodingTaskExecutionAuthorization,
  type GateEvaluation,
  type PlanRiskArtifact,
} from "../../../src/index.js";
import {
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
  StaticRepositoryRootResolverAdapter,
} from "../../../src/infrastructure/index.js";
import {
  CliCommand,
  CliResponseStatus,
  NodeJsonDocumentReaderAdapter,
  runCli,
  type CliWriter,
} from "../../../src/presentation/index.js";

const temporaryRoots: string[] = [];
const digest = new Rfc8785Sha256DigestAdapter();
const workspaceId = "coding-task-cell-workspace";
const codingTaskId = "coding-task-cell-task";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const correlationId = "coding-task-cell-correlation";
const submittedAt = "2026-07-14T00:00:00.000Z";
const fixedGitDate = "2026-07-14T00:00:00Z";
const originalAuthorDate = process.env["GIT_AUTHOR_DATE"];
const originalCommitterDate = process.env["GIT_COMMITTER_DATE"];
const writeSet = ["src/index.ts"] as const;
const remainingRisks = [
  { description: "实现可能改变导出行为。", mitigation: "运行本地验证并人工审查差异。" },
] as const;
const riskOperations = [{ target: "src/index.ts", reason: "修改仓库中的公开实现。" }] as const;
const rollbackPlan = ["回退 CodingTask 生成的单一 checkpoint。"] as const;

afterEach(async () => {
  restoreEnvironment("GIT_AUTHOR_DATE", originalAuthorDate);
  restoreEnvironment("GIT_COMMITTER_DATE", originalCommitterDate);
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CodingTask Cell CLI E2E", () => {
  it("完整运行后跨新 Application 实例复用 Receipt，且不重复 Git、File 或 Verification 副作用", async () => {
    const setup = await createSetup();

    const first = await runCell(setup);
    const second = await runCell(setup);

    expect(first.exitCode, JSON.stringify(first)).toBe(0);
    expect(second.exitCode, JSON.stringify(second)).toBe(0);
    expect(first.stderr).toHaveLength(0);
    expect(second.stderr).toHaveLength(0);
    const firstEnvelope = parseOutput(first.stdout);
    const secondEnvelope = parseOutput(second.stdout);
    expect(firstEnvelope).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.CellRun,
      data: {
        status: CodingTaskCellStatus.ReviewReady,
        evidenceBundle: { status: VerificationStatus.Passed },
        prReadyArtifact: {
          workspaceId,
          repositoryId: "repo-1",
          codingTaskId,
          sourceTaskId,
          baseRevision: setup.baseRevision,
          headRevision: setup.targetRevision,
          writeSet,
          verification: { status: VerificationStatus.Passed },
          remainingRisks,
          riskOperations,
          rollbackPlan,
          dependencyAssessment: {
            status: DependencyAssessmentStatus.NotAssessed,
            changes: [],
          },
        },
        receipts: [
          { stage: CodingTaskCellStage.Create },
          { stage: CodingTaskCellStage.Provision },
          { stage: CodingTaskCellStage.StartAttempt },
          { stage: CodingTaskCellStage.Implementation, implementationIndex: 0 },
          { stage: CodingTaskCellStage.Submission },
          { stage: CodingTaskCellStage.Verification },
        ],
      },
    });
    expect(secondEnvelope).toEqual(firstEnvelope);
    expect(await runGit(setup.worktreeRoot, ["rev-parse", "HEAD"])).toBe(setup.targetRevision);
    expect(
      await runGit(setup.worktreeRoot, ["rev-list", "--count", `${setup.baseRevision}..HEAD`]),
    ).toBe("1");
    expect(await readFile(join(setup.worktreeRoot, "src", "index.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );
    expect(await readFile(setup.verificationCounter, "utf8")).toBe("1");
  }, 20_000);
});

/** Cell CLI 真实运行所需的临时仓库与持久化路径。 */
interface CellSetup {
  readonly storeRoot: string;
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly manifestFile: string;
  readonly verificationCounter: string;
  readonly baseRevision: string;
  readonly targetRevision: string;
}

async function createSetup(): Promise<CellSetup> {
  const storeRoot = await createTemporaryRoot("liushi-cell-store-");
  const repositoryRoot = await createTemporaryRoot("liushi-cell-repo-");
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await runGit(repositoryRoot, ["config", "core.autocrlf", "false"]);
  await runGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, ["commit", "-m", "base"]);
  const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  process.env["GIT_AUTHOR_DATE"] = fixedGitDate;
  process.env["GIT_COMMITTER_DATE"] = fixedGitDate;
  const targetRevision = await predictCheckpoint(repositoryRoot, baseRevision);
  const worktreeRoot = join(repositoryRoot, "worktrees", "cell");
  const verificationCounter = join(storeRoot, "verification-count.txt");
  const application = createApplication(storeRoot, repositoryRoot);
  const sourceTask = await application.createTask.execute({
    workspaceId,
    source: "coding-task-cell-e2e",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  if (sourceTask.status === ResultStatus.Failure) throw sourceTask.error;
  const requirement = await application.proposeArtifact.execute({
    workspaceId,
    taskId: sourceTaskId,
    actor: { kind: ActorKind.Human, actorId: "human" },
    proposal: requirementProposal(),
  });
  if (
    requirement.status === ResultStatus.Failure ||
    requirement.value.decisionRequest === undefined
  ) {
    throw new Error("RequirementContract 必须产生 G1 DecisionRequest。");
  }
  const requirementApproval = await application.recordApproval.execute({
    workspaceId,
    taskId: sourceTaskId,
    decisionRequestId: requirement.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: requirement.value.decisionRequest.digest,
    idempotencyKey: "coding-task-cell-approve-requirement",
    actor: { kind: ActorKind.Human, actorId: "human" },
    decision: ApprovalDecision.Approved,
  });
  if (requirementApproval.status === ResultStatus.Failure) throw requirementApproval.error;
  const plan = await application.proposeArtifact.execute({
    workspaceId,
    taskId: sourceTaskId,
    actor: { kind: ActorKind.Human, actorId: "human" },
    proposal: planRiskProposal(),
  });
  if (plan.status === ResultStatus.Failure) throw plan.error;
  if (
    plan.value.decisionRequest === undefined ||
    plan.value.artifact.artifactType !== ArtifactType.PlanRisk
  ) {
    throw new Error("R2 PlanRisk 必须产生 G4 DecisionRequest。");
  }
  const planApproval = await application.recordApproval.execute({
    workspaceId,
    taskId: sourceTaskId,
    decisionRequestId: plan.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: plan.value.decisionRequest.digest,
    idempotencyKey: "coding-task-cell-approve-plan-risk",
    actor: { kind: ActorKind.Human, actorId: "human" },
    decision: ApprovalDecision.Approved,
  });
  if (planApproval.status === ResultStatus.Failure) throw planApproval.error;
  const executionAuthorization = createExecutionAuthorization(
    plan.value.artifact,
    planApproval.value.gateEvaluation,
  );
  const manifestFile = join(storeRoot, "codingTaskCell.json");
  const manifest = createManifest({
    repositoryRoot,
    worktreeRoot,
    baseRevision,
    targetRevision,
    verificationCounter,
    executionAuthorization,
  });
  await writeFile(manifestFile, JSON.stringify(manifest), "utf8");
  return {
    storeRoot,
    repositoryRoot,
    worktreeRoot,
    manifestFile,
    verificationCounter,
    baseRevision,
    targetRevision,
  };
}

function createManifest(input: {
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly baseRevision: string;
  readonly targetRevision: string;
  readonly verificationCounter: string;
  readonly executionAuthorization: CodingTaskExecutionAuthorization;
}) {
  const binding = {
    worktreeId: "cell-worktree",
    relativePath: "worktrees/cell",
    branchName: "feature/coding-task-cell",
    managed: true,
  };
  const createPayload = {
    workspaceId,
    sourceTaskId,
    repositoryId: "repo-1",
    baseRevision: input.baseRevision,
    worktreeBinding: binding,
    writeSet,
    inputBindingSet: { bindings: [] },
    executionAuthorization: input.executionAuthorization,
  };
  const provisionPayload = rootPayload("01ARZ3NDEKTSV4RRFFQ69G5FC2", input.repositoryRoot);
  const implementationPayload = {
    workspaceId,
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC3",
    attemptNumber: 1,
    runtimeRootDigest: calculateDigest({ repositoryRoot: input.repositoryRoot }),
    mutations: [
      {
        path: "src/index.ts",
        kind: FileMutationKind.Replace,
        expectedContentDigest: calculateDigest("export const value = 1;\n"),
        content: "export const value = 2;\n",
        contentDigest: calculateDigest("export const value = 2;\n"),
      },
    ],
  };
  const submissionPayload = rootPayload("01ARZ3NDEKTSV4RRFFQ69G5FC4", input.repositoryRoot);
  const verificationPayload = createVerificationPayload(input, binding);
  return {
    schemaVersion: CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
    createCommand: command("cell-create", CodingTaskCommandType.Create, 0, createPayload),
    provision: {
      command: command("cell-provision", WORKTREE_PROVISION_COMMAND_TYPE, 1, provisionPayload),
      runtime: { repositoryRoot: input.repositoryRoot },
    },
    startAttemptCommand: command("cell-start", CodingTaskCommandType.StartAttempt, 1, {
      workspaceId,
      attemptNumber: 1,
    }),
    implementations: [
      {
        command: command(
          "cell-implementation",
          IMPLEMENTATION_APPLY_COMMAND_TYPE,
          2,
          implementationPayload,
        ),
        runtime: { repositoryRoot: input.repositoryRoot },
      },
    ],
    submission: {
      command: command("cell-submission", IMPLEMENTATION_SUBMIT_COMMAND_TYPE, 2, {
        ...submissionPayload,
        attemptNumber: 1,
      }),
      runtime: { repositoryRoot: input.repositoryRoot },
    },
    verification: {
      command: command("cell-verification", VERIFICATION_RUN_COMMAND_TYPE, 3, verificationPayload),
      runtime: { worktreeRoot: input.worktreeRoot },
    },
  };
}

function createVerificationPayload(
  input: Parameters<typeof createManifest>[0],
  binding: { readonly worktreeId: string; readonly branchName: string },
) {
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH");
  if (pathKey === undefined) throw new Error("测试环境缺少 PATH。");
  const counterScript =
    "const fs=require('node:fs');const p=process.argv[1];let n=0;try{n=Number(fs.readFileSync(p,'utf8'))}catch{}fs.writeFileSync(p,String(n+1));";
  return {
    workspaceId,
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC5",
    verificationRunId: "coding-task-cell-verification",
    attemptNumber: 1,
    worktreeRootDigest: calculateDigest({ worktreeRoot: input.worktreeRoot }),
    plan: {
      schemaVersion: 1,
      planId: "coding-task-cell-plan",
      repositoryId: "repo-1",
      worktreeId: binding.worktreeId,
      expectedBranchName: binding.branchName,
      baseRevision: input.baseRevision,
      targetRevision: input.targetRevision,
      checks: [
        {
          checkId: "external-counter",
          kind: VerificationKind.Custom,
          requirement: VerificationRequirement.Required,
          command: {
            executable: "node",
            args: ["-e", counterScript, input.verificationCounter],
            workingDirectory: "",
            allowedEnvironmentKeys: [pathKey],
          },
          timeoutMs: 10_000,
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
  expectedVersion: number,
  payload: unknown,
) {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId: codingTaskId,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: calculateDigest(payload),
    actor: { kind: "agent", actorId: "agent" },
    authorizationContext: {},
    correlationId,
    submittedAt,
    payload,
  };
}

function rootPayload(actionId: string, repositoryRoot: string) {
  return { workspaceId, actionId, repositoryRootDigest: calculateDigest({ repositoryRoot }) };
}

function createApplication(storeRoot: string, repositoryRoot: string) {
  return createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => sourceTaskId },
    verificationExecutionMode: VerificationExecutionMode.LocalCommand,
    repositoryRootResolver: new StaticRepositoryRootResolverAdapter([
      { workspaceId, repositoryId: "repo-1", repositoryRoot },
    ]),
  });
}

/** 构造触发 G1 Human Gate 的 RequirementContract Proposal。 */
function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "修改示例导出并形成可审查交付物。",
      goals: ["通过 CodingTask Cell 完成受控实现。"],
      nonGoals: ["自动创建 PR。"],
      observableBehaviors: ["src/index.ts 的导出值变为 2。"],
      acceptanceCriteria: ["验证通过并生成 PRReadyArtifact。"],
      includedScopes: ["src/index.ts"],
      forbiddenScopes: ["其他文件"],
      repositories: ["repo-1"],
      edgeCases: ["重复执行同一 manifest"],
      compatibilityConstraints: ["保持单一 checkpoint"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

/** 构造需要 G4 Human Gate 的 R2 PlanRisk Proposal。 */
function planRiskProposal() {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "修改 src/index.ts。" }],
      readSet: writeSet,
      writeSet,
      risks: remainingRisks,
      riskLevel: RiskLevel.R2,
      historicalLogicChange: false,
      riskOperations,
      testPlan: ["运行 LocalCommand Verification。"],
      rollbackPlan,
      requiredGates: [],
    },
  };
}

/** 仅把真实 PlanRisk Artifact 与批准后的 GateEvaluation 映射为命令绑定。 */
function createExecutionAuthorization(
  planRisk: PlanRiskArtifact,
  evaluation: GateEvaluation,
): CodingTaskExecutionAuthorization {
  if (
    evaluation.result !== GateEvaluationResult.Allow ||
    evaluation.artifactId !== planRisk.artifactId ||
    evaluation.artifactDigest !== planRisk.digest
  ) {
    throw new Error("PlanRisk 批准结果未精确绑定当前 Artifact。");
  }
  return {
    planRisk: {
      artifactId: planRisk.artifactId,
      artifactDigest: planRisk.digest,
      result: evaluation.result,
      requiredGates: evaluation.requiredGates,
      satisfiedApprovalIds: evaluation.satisfiedApprovals,
    },
    historicalLogicChange: false,
  };
}

async function predictCheckpoint(repositoryRoot: string, baseRevision: string): Promise<string> {
  const predictionRoot = await createTemporaryRoot("liushi-cell-prediction-");
  await runGit(repositoryRoot, [
    "worktree",
    "add",
    "-b",
    "feature/coding-task-cell-prediction",
    predictionRoot,
    baseRevision,
  ]);
  await writeFile(join(predictionRoot, "src", "index.ts"), "export const value = 2;\n");
  await runGit(predictionRoot, ["add", "src/index.ts"]);
  await runGit(predictionRoot, ["commit", "-m", `harness: submit ${codingTaskId} attempt 1`]);
  const targetRevision = await runGit(predictionRoot, ["rev-parse", "HEAD"]);
  await runGit(repositoryRoot, ["worktree", "remove", "--force", predictionRoot]);
  await runGit(repositoryRoot, ["branch", "-D", "feature/coding-task-cell-prediction"]);
  return targetRevision;
}

async function runCell(setup: CellSetup) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer: CliWriter = {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  };
  const exitCode = await runCli(
    ["cell", "run", "--file", setup.manifestFile, "--store", setup.storeRoot, "--json"],
    {
      defaultStoreRoot: setup.storeRoot,
      applicationFactory: {
        create: (root) => createApplication(root, setup.repositoryRoot),
      },
      writer,
      jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    },
  );
  return { exitCode, stdout, stderr };
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure) throw result.error;
  if (result.value.exitCode !== 0) throw new Error(`Git 命令失败：${args[0] ?? "unknown"}。`);
  return result.value.stdout.trim();
}

async function createTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function calculateDigest(value: unknown): string {
  const result = digest.calculate(value);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function parseOutput(stdout: readonly string[]) {
  expect(stdout).toHaveLength(1);
  return JSON.parse(stdout[0]!) as {
    readonly status: CliResponseStatus;
    readonly command: CliCommand;
    readonly data: unknown;
  };
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
