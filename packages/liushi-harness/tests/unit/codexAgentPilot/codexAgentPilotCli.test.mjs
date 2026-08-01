import { describe, expect, it } from "vitest";

import { bindPilotCliInput, parsePilotCli } from "../../../scripts/codexAgentPilot/cli/index.mjs";
import { runCodexAgentPilot } from "../../../scripts/codexAgentPilot/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
  createHappyPathPilotEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

describe("Codex Agent Pilot CLI", () => {
  it("prepare 接受本地 Case，其他命令不暴露内部摘要", () => {
    expect(
      parsePilotCli([
        "prepare",
        "--root",
        "C:\\pilot",
        "--actor-id",
        "human",
        "--codex",
        "C:\\codex.exe",
        "--codex-home",
        "C:\\home",
        "--model",
        "gpt-5.6-sol",
        "--case",
        "C:\\pilot-case.json",
      ]),
    ).toMatchObject({ command: "prepare", caseFile: "C:\\pilot-case.json" });

    for (const command of ["preview-host", "approve-host", "run-agent", "closeout", "complete"]) {
      expect(parsePilotCli([command, "--root", "C:\\pilot", "--actor-id", "human"])).toEqual({
        command,
        root: "C:\\pilot",
        actorId: "human",
      });
    }
    expect(
      parsePilotCli([
        "settle",
        "--root",
        "C:\\pilot",
        "--actor-id",
        "human",
        "--facts",
        "C:\\facts.json",
      ]),
    ).toEqual({
      command: "settle",
      root: "C:\\pilot",
      actorId: "human",
      factsFile: "C:\\facts.json",
    });
    expect(() =>
      parsePilotCli([
        "closeout",
        "--root",
        "C:\\pilot",
        "--actor-id",
        "human",
        "--state-digest",
        "sha256:state",
      ]),
    ).toThrow("不支持选项");
    expect(() =>
      parsePilotCli([
        "approve-host",
        "--root",
        "C:\\pilot",
        "--actor-id",
        "human",
        "--packet-digest",
        "sha256:packet",
      ]),
    ).toThrow("不支持选项");
  });

  it("approve 使用语义 Gate，拒绝无效 Gate 和多余选项", () => {
    expect(
      parsePilotCli(["approve", "--root", "C:\\pilot", "--actor-id", "human", "--gate", "G4"]),
    ).toEqual({ command: "approve", root: "C:\\pilot", actorId: "human", gate: "G4" });
    expect(() =>
      parsePilotCli(["approve", "--root", "C:\\pilot", "--actor-id", "human", "--gate", "G2"]),
    ).toThrow("只支持 G8、G1、G4");
    expect(() => parsePilotCli(["approve", "--root", "C:\\pilot", "--actor-id", "human"])).toThrow(
      "--gate",
    );
    expect(() =>
      parsePilotCli([
        "approve",
        "--root",
        "C:\\pilot",
        "--root",
        "C:\\other",
        "--actor-id",
        "human",
        "--gate",
        "G8",
      ]),
    ).toThrow("不能重复");
  });

  it("按语义阶段选择权威状态，摘要只在调用 Service 前内部注入", () => {
    const states = [
      state("sha256:g8", "waiting_human_approval", { gate: "G8" }),
      state("sha256:g1", "waiting_human_approval", { gate: "G1" }),
      state("sha256:g4", "waiting_human_approval", { gate: "G4" }),
      state("sha256:host-source", "waiting_host_approval"),
      state("sha256:host-pending", "waiting_host_approval", {
        hostPreview: {},
        pendingHostApproval: { approved: false, packetDigest: "sha256:packet" },
      }),
      state("sha256:host-approved", "host_approved", {
        hostApproval: { packetDigest: "sha256:packet" },
      }),
      state("sha256:closeout", "waiting_closeout"),
      state("sha256:completion", "waiting_completion"),
      state("sha256:settlement", "waiting_settlement"),
    ];

    expect(
      bindPilotCliInput(
        { command: "approve", root: "C:\\pilot", actorId: "human", gate: "G1" },
        states,
      ),
    ).toMatchObject({ gate: "G1", stateDigest: "sha256:g1" });
    expect(
      bindPilotCliInput({ command: "preview-host", root: "C:\\pilot", actorId: "human" }, states),
    ).toMatchObject({ stateDigest: "sha256:host-source" });
    expect(
      bindPilotCliInput({ command: "approve-host", root: "C:\\pilot", actorId: "human" }, states),
    ).toMatchObject({ stateDigest: "sha256:host-pending", packetDigest: "sha256:packet" });
    expect(
      bindPilotCliInput({ command: "run-agent", root: "C:\\pilot", actorId: "human" }, states),
    ).toMatchObject({ stateDigest: "sha256:host-approved", packetDigest: "sha256:packet" });
    expect(
      bindPilotCliInput({ command: "closeout", root: "C:\\pilot", actorId: "human" }, states),
    ).toMatchObject({ stateDigest: "sha256:closeout" });
    expect(
      bindPilotCliInput({ command: "complete", root: "C:\\pilot", actorId: "human" }, states),
    ).toMatchObject({ stateDigest: "sha256:completion" });
    expect(
      bindPilotCliInput(
        {
          command: "settle",
          root: "C:\\pilot",
          actorId: "human",
          factsFile: "C:\\facts.json",
        },
        states,
      ),
    ).toMatchObject({ stateDigest: "sha256:settlement", factsFile: "C:\\facts.json" });
  });

  it("语义阶段不存在时拒绝猜测或推进其他 Gate", () => {
    expect(() =>
      bindPilotCliInput({ command: "approve", root: "C:\\pilot", actorId: "human", gate: "G4" }, [
        state("sha256:g1", "waiting_human_approval", { gate: "G1" }),
      ]),
    ).toThrow("等待 G4");
  });

  it("真实入口只凭 Gate 完成审批并稳定重放，不要求 Human 搬运摘要", async () => {
    const fixture = await createCodexAgentPilotFixture();
    try {
      const harness = createHappyPathPilotEnvelope(fixture);
      const dependencies = fixture.dependencies(harness.runEnvelope);
      await runCodexAgentPilot(
        [
          "prepare",
          "--root",
          fixture.input.root,
          "--actor-id",
          fixture.input.actorId,
          "--codex",
          fixture.input.codex,
          "--codex-home",
          fixture.input.codexHome,
          "--model",
          fixture.input.model,
        ],
        dependencies,
      );
      const g8 = await approveThroughCli(fixture, harness, "G8");
      const replay = await approveThroughCli(fixture, harness, "G8");
      expect(replay.stateDigest).toBe(g8.stateDigest);
      expect(harness.counters.approval).toBe(1);

      await approveThroughCli(fixture, harness, "G1");
      const g4 = await approveThroughCli(fixture, harness, "G4");
      expect(g4).toMatchObject({
        status: "waiting_host_approval",
        effects: { approvalCount: 3, activationExecuted: true },
      });
      expect(harness.counters.approval).toBe(3);
    } finally {
      await cleanupCodexAgentPilotFixture(fixture);
    }
  });
});

function state(stateDigest, status, overrides = {}) {
  return { stateDigest, status, ...overrides };
}

function approveThroughCli(fixture, harness, gate) {
  return runCodexAgentPilot(
    ["approve", "--root", fixture.input.root, "--actor-id", fixture.input.actorId, "--gate", gate],
    fixture.dependencies(harness.runEnvelope),
  );
}
