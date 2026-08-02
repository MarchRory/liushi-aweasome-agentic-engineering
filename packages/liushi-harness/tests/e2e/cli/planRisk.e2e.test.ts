import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PlanRiskReviewKind, type PlanRiskAnalysisAgent } from "../../../src/application/index.js";
import { createHarnessApplication } from "../../../src/bootstrap/index.js";
import { success } from "../../../src/common/index.js";
import { ArtifactStatus, ArtifactType, EvidenceKind } from "../../../src/domain/index.js";
import { GateId, RiskLevel } from "../../../src/domain/policy/index.js";
import { StaticRepositoryRootResolverAdapter } from "../../../src/infrastructure/index.js";
import {
  NodeJsonDocumentReaderAdapter,
  runCli,
  type CliApplicationFactory,
  type CliWriter,
} from "../../../src/presentation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("plan-risk CLI E2E", () => {
  it("R1 必须由 Human confirm 提交，并幂等进入 ImplementationReady", async () => {
    const setup = await createSetup({
      analyze: () =>
        Promise.resolve(
          success({
            analysisKind: PlanRiskReviewKind.PlanRisk,
            businessLogicProposal: null,
            planRiskProposal: planRiskDraft(RiskLevel.R1, false),
          }),
        ),
    });
    const beforeRepository = await snapshotDirectory(setup.repositoryRoot);
    const beforeAnalysisStore = await readAllFiles(setup.storeRoot);

    const analysis = await runJson(
      [
        "plan-risk",
        "analyze",
        "--workspace",
        "workspace-a",
        "--task",
        setup.taskId,
        "--repository",
        "repo-a",
        "--root",
        setup.repositoryRoot,
        "--model",
        "frontier-model",
        "--json",
      ],
      setup,
    );
    expect(await readAllFiles(setup.storeRoot)).toBe(beforeAnalysisStore);
    expect(await snapshotDirectory(setup.repositoryRoot)).toEqual(beforeRepository);
    expect(JSON.stringify(analysis)).not.toContain("sha256:");

    const reviewPath = join(setup.root, "plan-risk-review.json");
    await writeFile(reviewPath, JSON.stringify(analysis), "utf8");
    const first = await confirm(reviewPath, setup);
    const second = await confirm(reviewPath, setup);

    expect(first).toMatchObject({
      command: "plan_risk.confirm",
      data: {
        artifactType: ArtifactType.PlanRisk,
        nextStep: "coding_task",
        riskLevel: RiskLevel.R1,
      },
    });
    expect(second).toMatchObject({ status: "success" });
    expect(JSON.stringify(first)).not.toContain("digest");
    expect(JSON.stringify(first)).not.toContain("sha256:");
    const storeText = await readAllFiles(setup.storeRoot);
    expect(storeText.match(/artifact_committed/g)?.length).toBe(2);
    expect(storeText.match(/approval_recorded/g)?.length).toBe(1);
    expect(storeText).toContain('"checkpoint":"implementation_ready"');
    expect(await snapshotDirectory(setup.repositoryRoot)).toEqual(beforeRepository);
  });

  it("历史逻辑严格经过 Business Logic/G2，再绑定 R3 PlanRisk/G4", async () => {
    const setup = await createSetup({
      analyze: (input) =>
        Promise.resolve(
          success(
            input.approvedBusinessLogic === undefined
              ? {
                  analysisKind: PlanRiskReviewKind.BusinessLogic,
                  businessLogicProposal: businessLogicProposal(),
                  planRiskProposal: null,
                }
              : {
                  analysisKind: PlanRiskReviewKind.PlanRisk,
                  businessLogicProposal: null,
                  planRiskProposal: planRiskDraft(RiskLevel.R3, true),
                },
          ),
        ),
    });
    const beforeRepository = await snapshotDirectory(setup.repositoryRoot);

    const businessAnalysis = await analyze(setup);
    const businessData = businessAnalysis["data"] as {
      reviewDraft: { answers: Array<{ question: string; answer: string }> };
    };
    businessData.reviewDraft.answers[0] = {
      question: "空值是否停止旧版回退？",
      answer: "停止回退并显示未知",
    };
    const businessPath = join(setup.root, "business-review.json");
    await writeFile(businessPath, JSON.stringify(businessAnalysis), "utf8");
    const businessConfirmation = await confirm(businessPath, setup);
    expect(businessConfirmation).toMatchObject({
      data: {
        artifactType: ArtifactType.BusinessLogicChangeContract,
        nextStep: "reanalyze_plan_risk",
      },
    });

    const planAnalysis = await analyze(setup);
    expect(JSON.stringify(planAnalysis)).not.toContain("businessLogicArtifactDigest");
    expect(JSON.stringify(planAnalysis)).not.toContain("sha256:");
    const planPath = join(setup.root, "historical-plan-review.json");
    await writeFile(planPath, JSON.stringify(planAnalysis), "utf8");
    const planConfirmation = await confirm(planPath, setup);
    expect(planConfirmation).toMatchObject({
      data: {
        artifactType: ArtifactType.PlanRisk,
        nextStep: "coding_task",
        riskLevel: RiskLevel.R3,
      },
    });
    const repeatedConfirmation = await confirm(planPath, setup);
    expect(repeatedConfirmation).toMatchObject({ status: "success" });

    const storeText = await readAllFiles(setup.storeRoot);
    expect(storeText.match(/artifact_committed/g)?.length).toBe(3);
    expect(storeText.match(/approval_recorded/g)?.length).toBe(3);
    expect(storeText).toContain(`"gate":"${GateId.G2BusinessLogic}"`);
    expect(storeText).toContain(`"gate":"${GateId.G4RiskOperation}"`);
    expect(storeText).toContain('"historicalLogicChange":true');
    expect(storeText).toContain('"businessLogicArtifactDigest":"sha256:');
    expect(storeText).toContain('"checkpoint":"implementation_ready"');
    expect(JSON.stringify(planConfirmation)).not.toContain("digest");
    expect(JSON.stringify(planConfirmation)).not.toContain("sha256:");
    expect(await snapshotDirectory(setup.repositoryRoot)).toEqual(beforeRepository);
  });
});

/** E2E 命令共享的 Runtime Store 与 Application Factory。 */
interface TestRuntime {
  /** Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** 每次 CLI 调用创建 Application 的工厂。 */
  readonly applicationFactory: CliApplicationFactory;
}

/** 一条 PlanRisk E2E 主线的临时环境。 */
interface TestSetup extends TestRuntime {
  /** 临时测试根目录。 */
  readonly root: string;
  /** 用于验证零改动的 Repository 根目录。 */
  readonly repositoryRoot: string;
  /** 已完成 G1 的 Task ID。 */
  readonly taskId: string;
}

async function createSetup(agent: PlanRiskAnalysisAgent): Promise<TestSetup> {
  const root = await mkdtemp(join(tmpdir(), "liushi-plan-risk-e2e-"));
  temporaryRoots.push(root);
  const repositoryRoot = join(root, "repository");
  const storeRoot = join(root, "store");
  await mkdir(repositoryRoot);
  await writeFile(join(repositoryRoot, "status.ts"), "export const status = 'legacy';\n", "utf8");
  const applicationFactory: CliApplicationFactory = {
    create: (runtimeRoot) =>
      createHarnessApplication({
        storeRoot: runtimeRoot,
        planRiskAnalysisAgent: agent,
        repositoryRootResolver: new StaticRepositoryRootResolverAdapter([
          { workspaceId: "workspace-a", repositoryId: "repo-a", repositoryRoot },
        ]),
      }),
  };
  const task = await runJson(["task", "create", "--workspace", "workspace-a", "--json"], {
    storeRoot,
    applicationFactory,
  });
  const taskId = (task["data"] as { taskId: string }).taskId;
  const requirementPath = join(root, "requirement-review.json");
  const proposal = requirementProposal();
  await writeFile(
    requirementPath,
    JSON.stringify({ data: { proposal, reviewDraft: { proposal, answers: [] } } }),
    "utf8",
  );
  await runJson(
    [
      "requirement",
      "confirm",
      "--file",
      requirementPath,
      "--workspace",
      "workspace-a",
      "--task",
      taskId,
      "--repository",
      "repo-a",
      "--actor-id",
      "human-a",
      "--json",
    ],
    { storeRoot, applicationFactory },
  );
  return { root, repositoryRoot, storeRoot, taskId, applicationFactory };
}

function analyze(setup: TestSetup): Promise<Record<string, unknown>> {
  return runJson(
    [
      "plan-risk",
      "analyze",
      "--workspace",
      "workspace-a",
      "--task",
      setup.taskId,
      "--repository",
      "repo-a",
      "--root",
      setup.repositoryRoot,
      "--model",
      "frontier-model",
      "--json",
    ],
    setup,
  );
}

function confirm(reviewPath: string, setup: TestSetup): Promise<Record<string, unknown>> {
  return runJson(
    [
      "plan-risk",
      "confirm",
      "--file",
      reviewPath,
      "--workspace",
      "workspace-a",
      "--task",
      setup.taskId,
      "--repository",
      "repo-a",
      "--actor-id",
      "human-a",
      "--json",
    ],
    setup,
  );
}

async function runJson(
  args: readonly string[],
  setup: TestRuntime,
): Promise<Record<string, unknown>> {
  const output = createOutput();
  const exitCode = await runCli(args, {
    defaultStoreRoot: setup.storeRoot,
    applicationFactory: setup.applicationFactory,
    writer: output.writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
  });
  expect(exitCode, output.stderr.join("")).toBe(0);
  return JSON.parse(output.stdout.join("")) as Record<string, unknown>;
}

function createOutput(): { writer: CliWriter; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writer: {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "状态组件无法区分未知值",
      goals: ["明确展示未知状态"],
      nonGoals: ["修改权限模型"],
      observableBehaviors: ["用户看到明确状态"],
      acceptanceCriteria: ["空值显示符合产品决定"],
      includedScopes: ["src/status.ts"],
      forbiddenScopes: ["src/auth.ts"],
      repositories: ["repo-a"],
      edgeCases: ["后端返回空值"],
      compatibilityConstraints: ["非空状态行为不变"],
      evidence: [
        {
          evidenceId: "prd",
          kind: EvidenceKind.File,
          source: "prd",
          title: "status-prd.md",
        },
      ],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function businessLogicProposal() {
  return {
    artifactType: ArtifactType.BusinessLogicChangeContract,
    status: ArtifactStatus.Proposed,
    payload: {
      currentBehavior: { facts: [], inferences: [] },
      plannedBehavior: ["空值显示未知"],
      differences: ["停止旧版空值回退"],
      affectedConsumers: ["状态组件用户"],
      invariants: ["非空状态行为不变"],
      rollback: ["恢复旧版回退"],
      evidence: [],
      unknowns: ["空值是否停止旧版回退？"],
    },
  };
}

function planRiskDraft(riskLevel: RiskLevel, historicalLogicChange: boolean) {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "修改状态组件" }],
      readSet: ["status.ts"],
      writeSet: ["status.ts"],
      risks: [{ description: "状态展示变化", mitigation: "增加回归测试" }],
      riskLevel,
      historicalLogicChange,
      riskOperations:
        riskLevel === RiskLevel.R3 ? [{ target: "status.ts", reason: "改变历史运行行为" }] : [],
      testPlan: ["运行状态组件单元测试"],
      rollbackPlan: ["回退提交"],
      requiredGates: riskLevel === RiskLevel.R3 ? [GateId.G4RiskOperation] : [],
    },
  };
}

async function snapshotDirectory(root: string): Promise<Readonly<Record<string, string>>> {
  const names = await readdir(root);
  const entries = await Promise.all(
    names.sort().map(async (name) => [name, await readFile(resolve(root, name), "utf8")] as const),
  );
  return Object.fromEntries(entries);
}

async function readAllFiles(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? readAllFiles(path) : readFile(path, "utf8");
    }),
  );
  return contents.join("\n");
}
