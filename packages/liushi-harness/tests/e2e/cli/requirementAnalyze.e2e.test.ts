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
      data: {
        proposal: Record<string, unknown>;
        reviewDraft: { proposal: Record<string, unknown>; answers: Array<Record<string, string>> };
      };
    };
    analysisEnvelope.data.reviewDraft.proposal = {
      ...analysisEnvelope.data.reviewDraft.proposal,
      payload: {
        ...(analysisEnvelope.data.reviewDraft.proposal["payload"] as Record<string, unknown>),
        problem: "Human 修订后的问题",
      },
    };
    analysisEnvelope.data.reviewDraft.answers[0] = {
      question: "提示文案由谁确认？",
      answer: "Human 确认保留",
    };

    const taskOutput = createOutput();
    await runCli(
      ["task", "create", "--workspace", "workspace-a", "--json"],
      createDependencies(storeRoot, applicationFactory, taskOutput.writer),
    );
    const taskEnvelope = JSON.parse(taskOutput.stdout.join("")) as { data: { taskId: string } };
    const analysisPath = join(root, "analysis.json");
    await writeFile(analysisPath, JSON.stringify(analysisEnvelope), "utf8");

    const firstConfirmOutput = createOutput();
    const firstConfirmExitCode = await runCli(
      [
        "requirement",
        "confirm",
        "--workspace",
        "workspace-a",
        "--task",
        taskEnvelope.data.taskId,
        "--repository",
        "repo-a",
        "--file",
        analysisPath,
        "--actor-id",
        "human-a",
        "--json",
      ],
      createDependencies(storeRoot, applicationFactory, firstConfirmOutput.writer),
    );

    expect(firstConfirmExitCode).toBe(0);
    expect(JSON.parse(firstConfirmOutput.stdout.join(""))).toMatchObject({
      status: "success",
      command: "requirement.confirm",
      data: { confirmationStatus: "confirmed", nextStep: "plan_risk" },
    });
    expect(firstConfirmOutput.stdout.join("")).not.toContain("digest");
    expect(firstConfirmOutput.stdout.join("")).not.toContain("sha256:");

    const secondConfirmOutput = createOutput();
    const secondConfirmExitCode = await runCli(
      [
        "requirement",
        "confirm",
        "--workspace",
        "workspace-a",
        "--task",
        taskEnvelope.data.taskId,
        "--repository",
        "repo-a",
        "--file",
        analysisPath,
        "--actor-id",
        "human-a",
        "--json",
      ],
      createDependencies(storeRoot, applicationFactory, secondConfirmOutput.writer),
    );

    expect(secondConfirmExitCode).toBe(0);
    expect(secondConfirmOutput.stdout.join("")).not.toContain("digest");
    expect(secondConfirmOutput.stdout.join("")).not.toContain("sha256:");
    const storeText = await readAllFiles(storeRoot);
    expect(storeText.match(/artifact_committed/g)?.length).toBe(1);
    expect(storeText.match(/approval_recorded/g)?.length).toBe(1);
    expect(storeText).toContain('"gate":"G1"');
    expect(storeText).toContain('"decision":"approved"');
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
