import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createHarnessApplication } from "../../src/bootstrap/compositionRoot/index.js";
import { ResultStatus } from "../../src/common/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";
import {
  CliCommand,
  CliResponseStatus,
  NodeJsonDocumentReaderAdapter,
  runCli,
  type CliWriter,
} from "../../src/presentation/index.js";

describe("CLI E2E", () => {
  it("doctor --json 返回成功 Envelope，且只写入 stdout", async () => {
    await withStore(async (storeRoot) => {
      const output = await runCommand(["doctor", "--store", storeRoot, "--json"], storeRoot);
      expect(output.exitCode).toBe(0);
      expect(output.stdout).toHaveLength(1);
      expect(output.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(output.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.Doctor,
      });
    });
  });

  it("task create 后由新 Application 实例执行 task status 并返回同一状态", async () => {
    await withStore(async (storeRoot) => {
      const created = await runCommand(
        ["task", "create", "--workspace", "workspace-e2e", "--store", storeRoot, "--json"],
        storeRoot,
      );
      expect(created.exitCode).toBe(0);
      expect(created.stderr).toHaveLength(0);
      expect(created.stdout).toHaveLength(1);
      const createEnvelope = JSON.parse(singleOutput(created.stdout)) as {
        data: { taskId: string; workspaceId: string };
      };
      const taskId = createEnvelope.data.taskId;

      const status = await runCommand(
        [
          "task",
          "status",
          "--workspace",
          "workspace-e2e",
          "--task",
          taskId,
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(status.exitCode).toBe(0);
      expect(status.stderr).toHaveLength(0);
      expect(status.stdout).toHaveLength(1);
      expect(JSON.parse(singleOutput(status.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.TaskStatus,
        data: { taskId, workspaceId: createEnvelope.data.workspaceId },
      });
    });
  });

  it("unknown command --json 返回 InvalidInput failure 和退出码 2，且只写入 stderr", async () => {
    await withStore(async (storeRoot) => {
      const output = await runCommand(["unknown-command", "--json"], storeRoot);
      expect(output.exitCode).toBe(2);
      expect(output.stdout).toHaveLength(0);
      expect(output.stderr).toHaveLength(1);
      expect(JSON.parse(singleOutput(output.stderr))).toMatchObject({
        command: CliCommand.Unknown,
        status: CliResponseStatus.Failure,
        error: { code: "invalid_input" },
      });
    });
  });

  it("semantic CLI 完成 task -> artifact -> approval 生产闭环", async () => {
    await withStore(async (storeRoot) => {
      const workspaceId = "workspace-semantic-e2e";
      const created = await runCommand(
        ["task", "create", "--workspace", workspaceId, "--store", storeRoot, "--json"],
        storeRoot,
      );
      const createEnvelope = JSON.parse(singleOutput(created.stdout)) as {
        data: { taskId: string };
      };
      const taskId = createEnvelope.data.taskId;
      const proposalFile = resolve(storeRoot, "requirementProposal.json");
      await writeFile(proposalFile, JSON.stringify(requirementProposal()), "utf8");

      const proposed = await runCommand(
        [
          "artifact",
          "propose",
          "--workspace",
          workspaceId,
          "--task",
          taskId,
          "--file",
          proposalFile,
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(proposed.exitCode).toBe(0);
      expect(proposed.stderr).toHaveLength(0);
      const proposeEnvelope = JSON.parse(singleOutput(proposed.stdout)) as {
        data: {
          decisionRequest: { decisionRequestId: string; digest: string };
          task: { runState: string };
        };
      };
      expect(proposeEnvelope.data.task.runState).toBe("waiting_human");

      const approved = await runCommand(
        [
          "approval",
          "decide",
          "--workspace",
          workspaceId,
          "--task",
          taskId,
          "--request",
          proposeEnvelope.data.decisionRequest.decisionRequestId,
          "--request-digest",
          proposeEnvelope.data.decisionRequest.digest,
          "--decision",
          "approved",
          "--idempotency-key",
          "semantic-e2e-approval",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(approved.exitCode).toBe(0);
      expect(approved.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(approved.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ApprovalDecide,
        data: {
          disposition: "recorded",
          gateEvaluation: { result: "allow" },
          task: { phase: "planning", runState: "running" },
        },
      });
    });
  });

  it("rules resolve 从受限 JSON 文件生成可执行 Bundle", async () => {
    await withStore(async (storeRoot) => {
      const documents = createRuleResolutionDocuments();
      const catalogFile = resolve(storeRoot, "ruleCatalog.json");
      const contextFile = resolve(storeRoot, "ruleContext.json");
      await writeFile(catalogFile, JSON.stringify(documents.catalog), "utf8");
      await writeFile(contextFile, JSON.stringify(documents.context), "utf8");

      const output = await runCommand(
        ["rules", "resolve", "--catalog", catalogFile, "--context", contextFile, "--json"],
        storeRoot,
      );

      expect(output.exitCode).toBe(0);
      expect(output.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(output.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.RulesResolve,
        data: {
          resolutionStatus: "ready",
          rules: [
            {
              ruleId: "architecture.layering",
              matchedTargetIds: ["target.domain"],
            },
          ],
        },
      });
    });
  });

  it("rules resolve 对 blocked Bundle 返回状态 blocked 和退出码 4", async () => {
    await withStore(async (storeRoot) => {
      const documents = createRuleResolutionDocuments();
      const catalogFile = resolve(storeRoot, "blockedRuleCatalog.json");
      const contextFile = resolve(storeRoot, "blockedRuleContext.json");
      await writeFile(catalogFile, JSON.stringify(documents.catalog), "utf8");
      await writeFile(
        contextFile,
        JSON.stringify({ ...documents.context, availableValidatorIds: [] }),
        "utf8",
      );

      const jsonOutput = await runCommand(
        ["rules", "resolve", "--catalog", catalogFile, "--context", contextFile, "--json"],
        storeRoot,
      );
      expect(jsonOutput.exitCode).toBe(4);
      expect(jsonOutput.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(jsonOutput.stdout))).toMatchObject({
        status: CliResponseStatus.Blocked,
        command: CliCommand.RulesResolve,
        data: {
          resolutionStatus: "blocked",
          missingValidators: [
            { ruleId: "architecture.layering", validatorId: "eslint.architecture" },
          ],
        },
      });

      const humanOutput = await runCommand(
        ["rules", "resolve", "--catalog", catalogFile, "--context", contextFile],
        storeRoot,
      );
      expect(humanOutput.exitCode).toBe(4);
      expect(humanOutput.stderr).toHaveLength(0);
      expect(singleOutput(humanOutput.stdout)).toContain("status=blocked");
    });
  });

  it("Human help 输出全部真实命令，且只写入 stdout", async () => {
    await withStore(async (storeRoot) => {
      const output = await runCommand(["help"], storeRoot);
      expect(output.exitCode).toBe(0);
      expect(output.stderr).toHaveLength(0);
      expect(output.stdout).toHaveLength(1);
      expect(singleOutput(output.stdout).split("\n").filter(Boolean)).toEqual([
        expect.stringContaining("doctor"),
        expect.stringContaining("task create"),
        expect.stringContaining("task status"),
        expect.stringContaining("artifact propose"),
        expect.stringContaining("approval decide"),
        expect.stringContaining("rules resolve"),
      ]);
    });
  });
});

/** CLI Runner 的可观察输出。 */
interface CommandOutput {
  /** CLI 进程语义退出码。 */
  exitCode: number;
  /** 捕获的标准输出片段。 */
  stdout: string[];
  /** 捕获的标准错误片段。 */
  stderr: string[];
}

/** 通过真实 CLI Runner 捕获 stdout、stderr 和退出码。 */
async function runCommand(args: readonly string[], storeRoot: string): Promise<CommandOutput> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer: CliWriter = {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  };
  const exitCode = await runCli(args, {
    defaultStoreRoot: storeRoot,
    applicationFactory: { create: (root) => createHarnessApplication({ storeRoot: root }) },
    writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
  });
  return { exitCode, stdout, stderr };
}

/** 返回已由测试断言为单条的 CLI 输出。 */
function singleOutput(values: readonly string[]): string {
  expect(values).toHaveLength(1);
  return values[0] as string;
}

function requirementProposal(): object {
  return {
    artifactType: "requirement_contract",
    status: "proposed",
    payload: {
      problem: "Validate the semantic CLI workflow.",
      goals: ["Record an exact Human approval."],
      nonGoals: ["Execute implementation changes."],
      observableBehaviors: ["Approval resumes planning."],
      acceptanceCriteria: ["CLI returns an allowed Gate evaluation."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["stale digest"],
      compatibilityConstraints: ["event log remains append-only"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function createRuleResolutionDocuments(): { catalog: object; context: object } {
  const workspaceRef = {
    workspaceId: "workspace-rules-e2e",
    workspaceGraphRevision: "graph-1",
  };
  const repositoryRefs = [
    {
      repositoryId: "frontend",
      repositoryRevision: "commit-1",
      projectProfileRevision: "profile-1",
      architectureMechanismProfileRevision: "mechanism-1",
    },
  ];
  const ruleInput = {
    schemaVersion: "1.0.0",
    ruleId: "architecture.layering",
    version: "1.0.0",
    status: "active",
    category: "architecture",
    enforcement: "blocking",
    familyKey: "architecture.layering",
    outcomeKey: "domain.no_infrastructure",
    scope: { level: "workspace", workspaceId: workspaceRef.workspaceId },
    selector: { pathGlobs: ["src/**/*.ts"], languages: ["typescript"] },
    statement: "Domain source must not import infrastructure modules.",
    rationale: "Dependency direction protects the domain boundary.",
    validatorIds: ["eslint.architecture"],
    requiredCapabilityIds: [],
    sourceRefs: [{ kind: "project_file", sourceId: "eslint.config.js", revision: "commit-1" }],
    invalidationRefs: [],
    approvedExampleRefs: [],
    negativeExampleRefs: [],
    conflictsWithRuleIds: [],
    owner: { kind: "human", actorId: "architecture-owner" },
    reviewedAt: "2026-07-11T00:00:00.000Z",
  };
  const ruleDigest = calculateDigest(ruleInput);
  const rule = { ...ruleInput, digest: ruleDigest };
  const catalogInput = {
    schemaVersion: "1.0.0",
    catalogId: "workspace.rules",
    revision: 1,
    workspaceRef,
    repositoryRefs,
    rules: [
      {
        ruleId: rule.ruleId,
        version: rule.version,
        status: rule.status,
        digest: rule.digest,
      },
    ],
  };
  return {
    catalog: {
      schemaVersion: catalogInput.schemaVersion,
      catalogId: catalogInput.catalogId,
      revision: catalogInput.revision,
      workspaceRef,
      repositoryRefs,
      rules: [rule],
      digest: calculateDigest(catalogInput),
    },
    context: {
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaceRef,
      repositoryRefs,
      targets: [
        {
          targetId: "target.domain",
          repositoryId: "frontend",
          relativePath: "src/domain/order.ts",
          language: "typescript",
          fileKind: "source",
          operation: "modify",
        },
      ],
      availableValidatorIds: ["eslint.architecture"],
      availableCapabilityIds: [],
    },
  };
}

function calculateDigest(input: unknown): string {
  const result = new Rfc8785Sha256DigestAdapter().calculate(input);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

/** 创建临时 File Event Store，并保证测试结束后清理。 */
async function withStore(callback: (storeRoot: string) => Promise<void>): Promise<void> {
  const storeRoot = await mkdtemp(resolve(tmpdir(), "liushi-harness-e2e-"));
  try {
    await callback(storeRoot);
  } finally {
    const tempRoot = resolve(tmpdir());
    const relativePath = relative(tempRoot, resolve(storeRoot));
    if (isAbsolute(relativePath) || relativePath.startsWith("..") || relativePath === "") {
      throw new Error("Refusing to remove a Store outside os.tmpdir.");
    }
    await rm(storeRoot, { recursive: true, force: true });
  }
}
