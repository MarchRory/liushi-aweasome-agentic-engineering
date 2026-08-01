import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSessionActivationManifest } from "../../../scripts/codexAgentPilot/activation/index.mjs";
import {
  approveCodexAgentPilot,
  prepareCodexAgentPilot,
} from "../../../scripts/codexAgentPilot/service/index.mjs";
import {
  appendDerivedState,
  readStateChain,
} from "../../../scripts/codexAgentPilot/state/index.mjs";
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

describe("Codex Agent Pilot state machine", () => {
  it("按 G8 -> G1 -> G4 推进，并严格停止在 waiting_host_approval", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    expect(prepared.pendingDecisionRequest.gate).toBe("G8");
    let states = await readStateChain(prepared.paths.stateRoot);
    expect(states).toHaveLength(1);
    expect(states[0].approvals).toHaveLength(0);
    expect(states[0].effects).toMatchObject({
      activationExecuted: false,
      hookWrites: 0,
      modelLaunches: 0,
    });
    await expect(
      readFile(join(prepared.paths.controlRoot, "candidateHooks.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    let currentDigest = prepared.stateDigest;
    for (const expectedGate of ["G8", "G1", "G4"]) {
      const next = await approveCodexAgentPilot(
        { root: fixture.input.root, stateDigest: currentDigest, actorId: "human-actor" },
        fixture.dependencies(harness.runEnvelope),
      );
      currentDigest = next.stateDigest;
      expect(next.approvals.at(-1).decision).toBe("approved");
      expect(next.effects.approvalCount).toBe(next.approvals.length);
      if (expectedGate !== "G4") {
        expect(next.pendingDecisionRequest.gate).toBe(expectedGate === "G8" ? "G1" : "G4");
      }
    }

    states = await readStateChain(prepared.paths.stateRoot);
    const final = states.at(-1);
    expect(states).toHaveLength(4);
    expect(final.status).toBe("waiting_host_approval");
    expect(final.activation.candidateConfigDigest).toMatch(/^sha256:/u);
    expect(final.activation.promptDigest).toMatch(/^sha256:/u);
    expect(final.activation.activationDigest).toMatch(/^sha256:/u);
    expect(final.activation.targetDigest).toMatch(/^sha256:/u);
    expect(final.activation.targetFile).toBe(
      join(final.activation.worktreeRoot, "test", "utils.test.ts"),
    );
    expect(final.activation.hostPacket).toMatchObject({
      project: {
        targetSnapshot: {
          relativePath: "test/utils.test.ts",
          digest: final.activation.targetDigest,
        },
      },
      execution: {
        mode: "codex_app_server_file_change_approval.v1",
        modelProvider: "liushi_restricted_openai",
        modelLaunchLimit: 1,
        reconnectAttempts: 0,
      },
      permissions: {
        profile: ":read-only",
        approvalPolicy: "on-request",
        userConfigLoaded: false,
        projectInstructionsLoaded: false,
        allowedMutationSurfaces: ["fileChange"],
        allowedFileChangeKinds: ["update"],
        fileChangeDecision: "accept",
        runtimeOverrides: expect.any(Array),
      },
      host: {
        codexExecutable: { version: "codex-cli 0.145.0" },
        launchExecuted: false,
        trustWritten: false,
        hookBound: false,
        fileChangeApprovalBound: false,
      },
    });
    expect(final.activation.hostPacket.agentPrompt.targetDigest).toBe(
      final.activation.targetDigest,
    );
    const prompt = await readFile(final.activation.promptFile, "utf8");
    const targetSource = await readFile(final.activation.targetFile, "utf8");
    expect(prompt).toContain(`digest=${final.activation.targetDigest}`);
    expect(prompt).toContain(`contentJson=${JSON.stringify(targetSource)}`);
    expect(prompt).toContain("只允许调用一次 apply_patch");
    expect(prompt).toContain(
      "禁止调用 shell、Bash、unified_exec、MCP、Apps、Web Search 或子 Agent",
    );
    expect(prompt).toContain("禁止运行测试、格式化、Git、Closeout、Completion");
    expect(final.effects).toMatchObject({
      activationExecuted: true,
      hookWrites: 0,
      modelLaunches: 0,
    });
    await expect(
      approveCodexAgentPilot(
        { root: fixture.input.root, stateDigest: currentDigest, actorId: "human-actor" },
        fixture.dependencies(() => {
          throw new Error("禁止启动任何进程");
        }),
      ),
    ).rejects.toThrow("waiting_host_approval");
    expect(harness.counters).toMatchObject({
      proposal: 3,
      approval: 3,
      profile: 1,
      activation: 1,
    });
  });

  it("G8 外部副作用完成但状态追加失败后可按原 stateDigest 安全重放", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    let injectFailure = true;
    const appendWithFailure = async (...args) => {
      if (injectFailure) {
        injectFailure = false;
        throw new Error("注入状态追加失败");
      }
      return appendDerivedState(...args);
    };

    await expect(
      approveCodexAgentPilot(
        {
          root: fixture.input.root,
          stateDigest: prepared.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(harness.runEnvelope, {
          appendDerivedState: appendWithFailure,
        }),
      ),
    ).rejects.toThrow("注入状态追加失败");
    expect(await readStateChain(prepared.paths.stateRoot)).toHaveLength(1);

    const recovered = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: prepared.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    expect(recovered.pendingDecisionRequest.gate).toBe("G1");
    expect(harness.counters).toMatchObject({
      proposal: 2,
      approval: 1,
      profile: 2,
      activation: 0,
    });
  });

  it("G1 重放保留旧 PlanRisk 孤儿文件并写入内容寻址 Proposal", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const g1 = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: prepared.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const legacyFile = join(prepared.paths.controlRoot, "planRisk.json");
    const legacyContent = `${JSON.stringify({ payload: { bindings: { legacy: true } } }, null, 2)}\n`;
    await writeFile(legacyFile, legacyContent, "utf8");
    let injectFailure = true;
    const failBeforePlanRiskCommit = async (consumerRoot, args) => {
      if (
        injectFailure &&
        args[0] === "artifact" &&
        args.some((arg) => arg.endsWith(":proposal:G4"))
      ) {
        injectFailure = false;
        throw new Error("注入 PlanRisk 提交前失败");
      }
      return harness.runEnvelope(consumerRoot, args);
    };

    await expect(
      approveCodexAgentPilot(
        {
          root: fixture.input.root,
          stateDigest: g1.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(failBeforePlanRiskCommit),
      ),
    ).rejects.toThrow("注入 PlanRisk 提交前失败");
    expect(await readStateChain(prepared.paths.stateRoot)).toHaveLength(2);

    const recovered = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: g1.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const controlFiles = await readdir(prepared.paths.controlRoot);
    const planFiles = controlFiles.filter((file) => /^planRisk\.[0-9a-f]{64}\.json$/u.test(file));

    expect(recovered.pendingDecisionRequest.gate).toBe("G4");
    expect(recovered.effects.approvalCount).toBe(2);
    expect(basename(recovered.proposal.file)).toBe(planFiles[0]);
    expect(planFiles).toHaveLength(1);
    expect(await readFile(legacyFile, "utf8")).toBe(legacyContent);
    expect(harness.counters).toMatchObject({
      proposal: 3,
      approval: 2,
      profile: 1,
      activation: 0,
    });
    expect(await readStateChain(prepared.paths.stateRoot)).toHaveLength(3);
  });

  it("并发批准同一 G8 stateDigest 只提交一个后继状态与一个 Proposal", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const approve = () =>
      approveCodexAgentPilot(
        {
          root: fixture.input.root,
          stateDigest: prepared.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(harness.runEnvelope),
      );

    const [left, right] = await Promise.all([approve(), approve()]);
    expect(left.stateDigest).toBe(right.stateDigest);
    const replayed = await approve();
    expect(replayed.stateDigest).toBe(left.stateDigest);
    expect(await readStateChain(prepared.paths.stateRoot)).toHaveLength(2);
    expect(harness.counters.proposal).toBe(2);
    expect(harness.counters.approval).toBe(1);
  });

  it("状态链继续推进后仍返回原始审批的直接后继状态", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const g1 = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: prepared.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: g1.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const countersBeforeReplay = { ...harness.counters };

    const replayed = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: prepared.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );

    expect(replayed.stateDigest).toBe(g1.stateDigest);
    expect(replayed.revision).toBe(2);
    expect(harness.counters).toEqual(countersBeforeReplay);
    expect(await readStateChain(prepared.paths.stateRoot)).toHaveLength(3);
  });

  it("G4 Activation 已执行但状态追加失败后复用同一 Manifest", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const g1 = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: prepared.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const g4 = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: g1.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const appendWithFailure = async () => {
      throw new Error("注入 G4 状态追加失败");
    };

    await expect(
      approveCodexAgentPilot(
        {
          root: fixture.input.root,
          stateDigest: g4.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(harness.runEnvelope, {
          appendDerivedState: appendWithFailure,
        }),
      ),
    ).rejects.toThrow("注入 G4 状态追加失败");
    const recovered = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: g4.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    expect(recovered.status).toBe("waiting_host_approval");
    expect(harness.counters.activation).toBe(1);
  });

  it("拒绝复用未绑定当前任务与执行授权的 Activation Manifest", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    const g1 = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: prepared.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const g4 = await approveCodexAgentPilot(
      {
        root: fixture.input.root,
        stateDigest: g1.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(harness.runEnvelope),
    );
    const manifestFile = join(prepared.paths.controlRoot, "sessionActivation.json");
    const staleManifest = createSessionActivationManifest({
      workspaceId: g4.task.workspaceId,
      taskId: "stale-task",
      repositoryId: g4.fixedProject.repositoryId,
      repositoryRevision: g4.fixedProject.revision,
      repositoryRoot: prepared.paths.repositoryRoot,
      writeSet: g4.fixedProject.writeSet,
      executionAuthorization: { stale: true },
    });
    await writeFile(manifestFile, `${JSON.stringify(staleManifest, null, 2)}\n`, "utf8");

    await expect(
      approveCodexAgentPilot(
        {
          root: fixture.input.root,
          stateDigest: g4.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(harness.runEnvelope),
      ),
    ).rejects.toThrow("未精确绑定");
    expect(harness.counters.activation).toBe(0);
    expect(await readStateChain(prepared.paths.stateRoot)).toHaveLength(3);
  });
});
