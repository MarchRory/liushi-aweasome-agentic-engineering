import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RequirementAnalysisAgent } from "../../../src/application/index.js";
import { createHarnessApplication } from "../../../src/bootstrap/index.js";
import { success } from "../../../src/common/index.js";
import { ArtifactStatus, ArtifactType, EvidenceKind } from "../../../src/domain/index.js";
import {
  NodeJsonDocumentReaderAdapter,
  NodeTextDocumentReaderAdapter,
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

describe("requirement analyze CLI E2E", () => {
  it("只读生成可直接提交的 Requirement Proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-requirement-e2e-"));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, "repository");
    const storeRoot = join(root, "store");
    const prdPath = join(root, "feature.md");
    await mkdir(repositoryRoot);
    await writeFile(join(repositoryRoot, "source.ts"), "export const value = 1;\n", "utf8");
    await writeFile(prdPath, "新增只读状态提示。\n", "utf8");
    const repositoryBefore = await snapshotDirectory(repositoryRoot);

    const agent: RequirementAnalysisAgent = {
      analyze: () => Promise.resolve(success(createProposal())),
    };
    const applicationFactory: CliApplicationFactory = {
      create: (runtimeRoot) =>
        createHarnessApplication({ storeRoot: runtimeRoot, requirementAnalysisAgent: agent }),
    };
    const analysisOutput = createOutput();
    const analysisExitCode = await runCli(
      [
        "requirement",
        "analyze",
        "--prd",
        prdPath,
        "--workspace",
        "workspace-a",
        "--repository",
        "repo-a",
        "--root",
        repositoryRoot,
        "--model",
        "frontier-model",
        "--json",
      ],
      createDependencies(storeRoot, applicationFactory, analysisOutput.writer),
    );

    expect(analysisExitCode).toBe(0);
    expect(await snapshotDirectory(repositoryRoot)).toEqual(repositoryBefore);
    await expect(stat(storeRoot)).rejects.toThrow();
    const analysisEnvelope = JSON.parse(analysisOutput.stdout.join("")) as {
      data: { proposal: unknown };
    };

    const taskOutput = createOutput();
    await runCli(
      ["task", "create", "--workspace", "workspace-a", "--json"],
      createDependencies(storeRoot, applicationFactory, taskOutput.writer),
    );
    const taskEnvelope = JSON.parse(taskOutput.stdout.join("")) as { data: { taskId: string } };
    const proposalPath = join(root, "proposal.json");
    await writeFile(proposalPath, JSON.stringify(analysisEnvelope.data.proposal), "utf8");

    const artifactOutput = createOutput();
    const artifactExitCode = await runCli(
      [
        "artifact",
        "propose",
        "--workspace",
        "workspace-a",
        "--task",
        taskEnvelope.data.taskId,
        "--file",
        proposalPath,
        "--json",
      ],
      createDependencies(storeRoot, applicationFactory, artifactOutput.writer),
    );

    expect(artifactExitCode).toBe(0);
    expect(JSON.parse(artifactOutput.stdout.join(""))).toMatchObject({
      status: "success",
      command: "artifact.propose",
      data: { artifact: { artifactType: ArtifactType.RequirementContract } },
    });
    expect(await snapshotDirectory(repositoryRoot)).toEqual(repositoryBefore);
  });
});

function createDependencies(
  storeRoot: string,
  applicationFactory: CliApplicationFactory,
  writer: CliWriter,
) {
  return {
    defaultStoreRoot: storeRoot,
    applicationFactory,
    writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    textDocumentReader: new NodeTextDocumentReaderAdapter(),
  };
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

function createProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "用户无法识别当前只读状态。",
      goals: ["展示只读状态"],
      nonGoals: ["修改权限模型"],
      observableBehaviors: ["用户可以看到只读提示"],
      acceptanceCriteria: ["只读状态展示正确"],
      includedScopes: ["状态提示"],
      forbiddenScopes: ["权限计算逻辑"],
      repositories: ["repo-a"],
      edgeCases: [],
      compatibilityConstraints: ["保持现有权限行为"],
      evidence: [
        {
          evidenceId: "prd",
          kind: EvidenceKind.File,
          source: "prd",
          title: "feature.md",
        },
      ],
      claims: [],
      unknowns: ["提示文案由谁确认？"],
      humanAnswers: [],
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
