import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createPublicCodexAgentPilotCase,
  validateCodexAgentPilotCase,
} from "../../../scripts/codexAgentPilot/case/index.mjs";
import { prepareCodexAgentPilot } from "../../../scripts/codexAgentPilot/service/index.mjs";
import { readStateChain } from "../../../scripts/codexAgentPilot/state/index.mjs";
import { createProjectProfileProposal } from "../../../scripts/codexAgentPilot/workflow/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
  createHappyPathPilotEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot Case", () => {
  it("规范化本地单仓低风险 Case", async () => {
    fixture = await createCodexAgentPilotFixture();
    const candidate = await createLocalCase(fixture);

    expect(validateCodexAgentPilotCase(candidate)).toMatchObject({
      schemaVersion: "liushi.codex-agent-pilot.case.v1",
      sourceKind: "local_repository",
      repository: {
        id: "unjs-defu",
        source: candidate.repository.source,
        revision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      },
      writeSet: ["test/utils.test.ts"],
      ruleTargets: [
        {
          targetId: "target-test-utils-test-ts",
          relativePath: "test/utils.test.ts",
          language: "typescript",
          fileKind: "test",
          operation: "modify",
        },
      ],
      availableCapabilityIds: [],
      historicalLogicChange: false,
      metrics: {
        pilotId: "public-defu-module-namespace-v1",
        taskClass: "test",
        plannedSteps: expect.arrayContaining([
          {
            stepId: "implementation",
            phase: "implement",
            required: true,
            expectedExecutionMode: "automated",
          },
        ]),
      },
    });
  });

  it("拒绝历史逻辑改动和越界写入路径", async () => {
    fixture = await createCodexAgentPilotFixture();
    const historicalChange = await createLocalCase(fixture);
    historicalChange.historicalLogicChange = true;
    expect(() => validateCodexAgentPilotCase(historicalChange)).toThrow(
      "historicalLogicChange=false",
    );

    const traversal = await createLocalCase(fixture);
    traversal.writeSet = ["../outside.ts"];
    expect(() => validateCodexAgentPilotCase(traversal)).toThrow("规范化 POSIX 相对文件路径");

    const windowsAbsolute = await createLocalCase(fixture);
    windowsAbsolute.writeSet = ["C:/outside.ts"];
    expect(() => validateCodexAgentPilotCase(windowsAbsolute)).toThrow("规范化 POSIX 相对文件路径");
  });

  it("严格校验 Rule Targets 和 Capability Registry IDs", async () => {
    fixture = await createCodexAgentPilotFixture();
    const duplicateTargetId = await createLocalCase(fixture);
    duplicateTargetId.ruleTargets[0].targetId = "other-target";
    duplicateTargetId.ruleTargets.push({ ...duplicateTargetId.ruleTargets[0] });
    expect(() => validateCodexAgentPilotCase(duplicateTargetId)).toThrow("targetId 必须唯一");

    const mismatchedTarget = await createLocalCase(fixture);
    mismatchedTarget.ruleTargets[0].relativePath = "src/index.ts";
    expect(() => validateCodexAgentPilotCase(mismatchedTarget)).toThrow("逐一一致");

    const extraTargetField = await createLocalCase(fixture);
    extraTargetField.ruleTargets[0].extra = true;
    expect(() => validateCodexAgentPilotCase(extraTargetField)).toThrow("字段必须严格匹配");

    const duplicateCapability = await createLocalCase(fixture);
    duplicateCapability.availableCapabilityIds = ["capability.test", "capability.test"];
    expect(() => validateCodexAgentPilotCase(duplicateCapability)).toThrow("重复 Registry ID");
  });

  it("拒绝与 Requirement 或 PlanRisk 不一致的写集", async () => {
    fixture = await createCodexAgentPilotFixture();
    const candidate = await createLocalCase(fixture);
    candidate.writeSet = ["src/index.ts"];
    candidate.ruleTargets[0].relativePath = "src/index.ts";

    expect(() => validateCodexAgentPilotCase(candidate)).toThrow("与 Write Set 不一致");
  });

  it("拒绝不完整或重复的量化分母", async () => {
    fixture = await createCodexAgentPilotFixture();
    const duplicateStep = await createLocalCase(fixture);
    duplicateStep.metrics.plannedSteps[1].stepId = duplicateStep.metrics.plannedSteps[0].stepId;
    expect(() => validateCodexAgentPilotCase(duplicateStep)).toThrow("stepId 必须唯一");

    const notExecuted = await createLocalCase(fixture);
    notExecuted.metrics.plannedSteps[0].expectedExecutionMode = "not_executed";
    expect(() => validateCodexAgentPilotCase(notExecuted)).toThrow("不得预登记 not_executed");
  });

  it("拒绝无效 Check 和与 Case 不一致的扫描结果", async () => {
    fixture = await createCodexAgentPilotFixture();
    const invalidCheck = await createLocalCase(fixture);
    invalidCheck.verificationChecks[0].command.executable = "node with space";
    expect(() => validateCodexAgentPilotCase(invalidCheck)).toThrow(
      "Project Verification Check 契约",
    );

    const candidate = validateCodexAgentPilotCase(await createLocalCase(fixture));
    const wrongWorkspace = globalThis.structuredClone(fixture.report);
    wrongWorkspace.workspaceId = "other-workspace";
    expect(() => createProjectProfileProposal(wrongWorkspace, candidate)).toThrow("workspaceId");

    const wrongRole = globalThis.structuredClone(fixture.report);
    wrongRole.profileCandidates[0].roleHint = "infra";
    expect(() => createProjectProfileProposal(wrongRole, candidate)).toThrow("roleHint");
  });

  it("prepare --case 走本地仓库并保留 Human 已对齐契约", async () => {
    fixture = await createCodexAgentPilotFixture();
    const candidate = await createLocalCase(fixture);
    const caseFile = join(fixture.outerRoot, "pilotCase.json");
    await writeFile(caseFile, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    const harness = createHappyPathPilotEnvelope(fixture);

    const prepared = await prepareCodexAgentPilot(
      { ...fixture.input, caseFile },
      fixture.dependencies(harness.runEnvelope, {
        cloneLocalProject: async ({ destinationRoot }) => {
          await mkdir(destinationRoot, { recursive: true });
          return destinationRoot;
        },
      }),
    );
    const state = (await readStateChain(prepared.paths.stateRoot)).at(-1);

    expect(state).toMatchObject({
      status: "waiting_human_approval",
      gate: "G8",
      fixedProject: {
        repositoryId: "unjs-defu",
        sourceKind: "local_repository",
        writeSet: ["test/utils.test.ts"],
        ruleTargets: candidate.ruleTargets,
        availableCapabilityIds: [],
        historicalLogicChange: false,
        metrics: candidate.metrics,
        requirementProposal: candidate.requirementProposal,
        planRiskProposal: candidate.planRiskProposal,
      },
      pilotCase: {
        schemaVersion: "liushi.codex-agent-pilot.case.v1",
        sourceKind: "local_repository",
      },
    });
  });
});

async function createLocalCase(currentFixture) {
  const sourceRoot = join(currentFixture.outerRoot, "source-repository");
  await mkdir(sourceRoot, { recursive: true });
  const candidate = globalThis.structuredClone(createPublicCodexAgentPilotCase());
  candidate.sourceKind = "local_repository";
  candidate.repository.source = sourceRoot;
  return candidate;
}
