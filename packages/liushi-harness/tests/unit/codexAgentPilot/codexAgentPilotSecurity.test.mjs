import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION as CORE_PROFILE_PROPOSAL_SCHEMA_VERSION,
  ResultStatus,
  parseArtifactProposal,
} from "../../../src/index.js";
import { PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION } from "../../../scripts/codexAgentPilot/constants/index.mjs";
import { calculateDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";
import {
  approveCodexAgentPilot,
  prepareCodexAgentPilot,
} from "../../../scripts/codexAgentPilot/service/index.mjs";
import { validateRecordedApproval } from "../../../scripts/codexAgentPilot/service/shared/index.mjs";
import {
  appendDerivedState,
  readStateChain,
  writeControlJsonIdempotent,
} from "../../../scripts/codexAgentPilot/state/index.mjs";
import {
  createPlanRiskProposal,
  createProjectProfileProposal,
  createRequirementProposal,
} from "../../../scripts/codexAgentPilot/workflow/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
  createHappyPathPilotEnvelope,
  createPilotProposalEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot security bindings", () => {
  it("所有 Pilot Proposal 均与核心 Schema 和真实解析器保持一致", async () => {
    fixture = await createCodexAgentPilotFixture();
    const proposals = [
      createProjectProfileProposal(fixture.report),
      createRequirementProposal(),
      createPlanRiskProposal(),
    ];
    const planProposal = proposals.at(-1);

    expect(PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION).toBe(CORE_PROFILE_PROPOSAL_SCHEMA_VERSION);
    for (const proposal of proposals) {
      expect(parseArtifactProposal(proposal)).toMatchObject({ status: ResultStatus.Success });
    }
    expect(Object.keys(planProposal.payload).sort()).toEqual(
      [
        "historicalLogicChange",
        "readSet",
        "requiredGates",
        "riskLevel",
        "riskOperations",
        "risks",
        "rollbackPlan",
        "steps",
        "testPlan",
        "writeSet",
      ].sort(),
    );
    expect(planProposal.payload).not.toHaveProperty("bindings");
  });

  it("拒绝非固定 SOTA 顶层模型，且不创建 Pilot Root", async () => {
    fixture = await createCodexAgentPilotFixture({ model: "gpt-5.6" });

    await expect(
      prepareCodexAgentPilot(
        fixture.input,
        fixture.dependencies(async () => ({})),
      ),
    ).rejects.toThrow("gpt-5.6-sol");
    await expect(readFile(fixture.input.root, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["DecisionRequest Digest", { approval: { decisionRequestDigest: "sha256:drift" } }],
    ["Gate", { approval: { gate: "G1" } }],
    ["Human actor", { approval: { actor: { kind: "human", actorId: "other" } } }],
    ["Idempotency Key", { approval: { idempotencyKey: "other" } }],
    ["GateEvaluation Artifact", { gateEvaluation: { artifactId: "other" } }],
  ])("拒绝未绑定当前状态的 %s", (_name, mutation) => {
    const artifact = {
      artifactId: "artifact-G8",
      digest: calculateDigest({ gate: "G8" }),
    };
    const request = {
      decisionRequestId: "request-G8",
      digest: calculateDigest({ request: "G8" }),
      gate: "G8",
      artifactId: artifact.artifactId,
      artifactDigest: artifact.digest,
    };
    const approval = {
      approvalId: "approval-1",
      decision: "approved",
      decisionRequestId: request.decisionRequestId,
      decisionRequestDigest: request.digest,
      gate: request.gate,
      artifactId: artifact.artifactId,
      artifactDigest: artifact.digest,
      actor: { kind: "human", actorId: "human-actor" },
      idempotencyKey: "pilot-approval",
      ...mutation.approval,
    };
    const gateEvaluation = {
      result: "allow",
      artifactId: artifact.artifactId,
      artifactDigest: artifact.digest,
      requiredGates: ["G8"],
      satisfiedApprovals: [approval.approvalId],
      ...mutation.gateEvaluation,
    };

    expect(() =>
      validateRecordedApproval({
        artifact,
        request,
        approval,
        gateEvaluation,
        expectedActorId: "human-actor",
        expectedIdempotencyKey: "pilot-approval",
      }),
    ).toThrow();
  });

  it("状态摘要、actor、Scan Report 和已安装 CLI 漂移均 fail closed", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const approvalInput = {
      root: fixture.input.root,
      stateDigest: prepared.stateDigest,
      actorId: "human-actor",
    };
    await expect(
      approveCodexAgentPilot(
        { ...approvalInput, stateDigest: "sha256:wrong" },
        fixture.dependencies(harness.runEnvelope),
      ),
    ).rejects.toThrow("stateDigest");
    await expect(
      approveCodexAgentPilot(
        { ...approvalInput, actorId: "other-human" },
        fixture.dependencies(harness.runEnvelope),
      ),
    ).rejects.toThrow("actor");

    const reportFile = join(prepared.paths.controlRoot, "scanReport.json");
    const report = JSON.parse(await readFile(reportFile, "utf8"));
    await writeFile(reportFile, `${JSON.stringify({ ...report, status: "drifted" })}\n`, "utf8");
    await expect(
      approveCodexAgentPilot(approvalInput, fixture.dependencies(harness.runEnvelope)),
    ).rejects.toThrow("Scan Report");

    await writeFile(reportFile, `${JSON.stringify(fixture.report, null, 2)}\n`, "utf8");
    const cliFile = join(
      fixture.consumerRoot,
      "node_modules",
      "liushi-harness",
      "dist",
      "bootstrap",
      "cli",
      "cliEntrypoint.js",
    );
    await writeFile(cliFile, "tampered\n", "utf8");
    await expect(
      approveCodexAgentPilot(approvalInput, fixture.dependencies(harness.runEnvelope)),
    ).rejects.toThrow("identity");
  });

  it("状态文件篡改和 Artifact/DecisionRequest 错绑均被拒绝", async () => {
    fixture = await createCodexAgentPilotFixture();
    const runEnvelope = async (_root, args) => {
      if (args[0] === "task")
        return { status: "success", data: { taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX" } };
      if (args[0] === "project") return { status: "success", data: fixture.report };
      return createPilotProposalEnvelope("G8");
    };
    const prepared = await prepareCodexAgentPilot(fixture.input, fixture.dependencies(runEnvelope));
    const stateFile = join(prepared.paths.stateRoot, "state-0001.json");
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    state.model = "tampered";
    await writeFile(stateFile, `${JSON.stringify(state)}\n`, "utf8");
    await expect(readStateChain(prepared.paths.stateRoot)).rejects.toThrow("摘要");

    fixture = await replaceFixture(fixture);
    const malformedEnvelope = async (_root, args) => {
      if (args[0] === "task")
        return { status: "success", data: { taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX" } };
      if (args[0] === "project") return { status: "success", data: fixture.report };
      return createPilotProposalEnvelope("G8", {
        request: { artifactDigest: "sha256:drift" },
      });
    };
    await expect(
      prepareCodexAgentPilot(fixture.input, fixture.dependencies(malformedEnvelope)),
    ).rejects.toThrow("绑定不一致");
  });

  it("状态链已推进后拒绝基于旧摘要追加 revision", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const current = (await readStateChain(prepared.paths.stateRoot)).at(-1);
    await appendDerivedState(
      prepared.paths.stateRoot,
      { ...current, externalTransition: true },
      { expectedPreviousStateDigest: current.stateDigest },
    );

    await expect(
      appendDerivedState(
        prepared.paths.stateRoot,
        { ...current, staleTransition: true },
        { expectedPreviousStateDigest: current.stateDigest },
      ),
    ).rejects.toThrow("过期状态");
  });

  it("确定性 Control JSON 可幂等恢复，但拒绝同路径内容漂移", async () => {
    fixture = await createCodexAgentPilotFixture();
    const file = join(fixture.outerRoot, "idempotent.json");

    await expect(writeControlJsonIdempotent(file, { value: 1 })).resolves.toEqual({
      created: true,
    });
    await expect(writeControlJsonIdempotent(file, { value: 1 })).resolves.toEqual({
      created: false,
    });
    await expect(writeControlJsonIdempotent(file, { value: 2 })).rejects.toThrow(
      "确定性结果不一致",
    );
  });
});

async function replaceFixture(current) {
  await cleanupCodexAgentPilotFixture(current);
  return createCodexAgentPilotFixture();
}
