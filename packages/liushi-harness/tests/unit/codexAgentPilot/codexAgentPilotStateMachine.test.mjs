import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
    expect(final.activation.hostPacket).toMatchObject({
      permissions: {
        sandbox: "workspace-write",
        approvalPolicy: "never",
        ignoreUserConfig: true,
      },
      host: {
        codexExecutable: { version: "codex-cli 0.145.0" },
        launchExecuted: false,
        trustWritten: false,
      },
    });
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
      repositoryRoot: prepared.paths.repositoryRoot,
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
