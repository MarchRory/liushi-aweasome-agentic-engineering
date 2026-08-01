import { readFile, readdir, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CODEX_AGENT_EXECUTION_MODE,
  CODEX_MODEL_PROVIDER_ID,
  CODEX_RESTRICTED_RUNTIME_OVERRIDES,
} from "../../../scripts/codexAgentPilot/constants/index.mjs";
import { calculateDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";
import {
  approveCodexAgentPilot,
  prepareCodexAgentPilot,
  previewCodexAgentPilotHost,
} from "../../../scripts/codexAgentPilot/service/index.mjs";
import { readStateChain } from "../../../scripts/codexAgentPilot/state/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
  createCodexAppServerPreflightFixture,
  createHappyPathPilotEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot Host preview", () => {
  it("绑定本地正负向预检、隔离运行时和单次 FileChange 审批", async () => {
    const context = await createWaitingHostContext();
    const evidence = createCodexAppServerPreflightFixture(context.current);
    const probeCodexAppServerFileChangeApproval = vi.fn(async () => evidence);

    const preview = await previewCodexAgentPilotHost(
      {
        root: fixture.input.root,
        stateDigest: context.current.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(context.harness.runEnvelope, {
        probeCodexAppServerFileChangeApproval,
      }),
    );

    const states = await readStateChain(context.prepared.paths.stateRoot);
    const final = states.at(-1);
    const packet = JSON.parse(await readFile(preview.hostApprovalPacketFile, "utf8"));
    const { packetDigest, ...packetBody } = packet;
    expect(states).toHaveLength(5);
    expect(packet.schemaVersion).toBe("liushi.codex-agent-pilot.host-approval.v3");
    expect(final.status).toBe("waiting_host_approval");
    expect(final.pendingHostApproval).toEqual({
      packetDigest,
      humanActorId: "human-actor",
      approved: false,
    });
    expect(final.effects).toMatchObject({
      activationExecuted: true,
      hostPreflightProcesses: 2,
      hookWrites: 0,
      modelLaunches: 0,
    });
    expect(calculateDigest(packetBody)).toBe(packetDigest);
    expect(packet.project).toMatchObject({
      repositoryRevision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      writeSet: ["test/utils.test.ts"],
      historicalLogicChange: false,
    });
    expect(packet.execution).toMatchObject({
      mode: CODEX_AGENT_EXECUTION_MODE.AppServerFileChangeApproval,
      reconnectAttempts: 0,
      retryAttempts: 0,
      provider: {
        id: CODEX_MODEL_PROVIDER_ID,
        supports_websockets: false,
      },
    });
    expect(packet.actionControl).toMatchObject({
      permissionProfile: ":read-only",
      approvalPolicy: "on-request",
      acceptedDecision: "accept",
      decisionScope: "single_request",
      grantRootAllowed: false,
      allowedMutationSurfaces: ["fileChange"],
      allowedFileChangeKinds: ["update"],
    });
    expect(packet.actionControl.allowedAbsolutePaths).toEqual([
      context.current.activation.targetFile,
    ]);
    expect(packet.runtimeIsolation).toMatchObject({
      externalConfigAllowed: false,
      externalSkillsAllowed: false,
      externalMcpAllowed: false,
      credentialContentReadByHarness: false,
      cleanupRequiresConfirmedProcessExit: true,
    });
    expect(packet.runtimeIsolation.planDigest).toBe(calculateDigest(packet.runtimeIsolation.plan));
    expect(packet.runtimeIsolation.environmentPolicy.digest).toBe(
      calculateDigest({
        version: packet.runtimeIsolation.environmentPolicy.version,
        inheritedNames: packet.runtimeIsolation.environmentPolicy.inheritedNames,
        managedNames: packet.runtimeIsolation.environmentPolicy.managedNames,
      }),
    );
    expect(packet.preflight).toMatchObject({
      appServerProcesses: 2,
      realModelRequests: 0,
      evidenceDigest: evidence.evidenceDigest,
      evidence: {
        authorizationOrigin: "synthetic_preflight",
      },
    });
    expect(packet.codex.nativeHookControl).toBeUndefined();
    expect(packet.requiredHumanApproval.nativeHookUnavailableAcknowledged).toBeUndefined();
    expect(packet.compatibilityArtifacts).toMatchObject({
      enforcement: false,
      persistentWrites: 0,
    });
    expect(packet.launch.arguments).toContain("--strict-config");
    expect(packet.launch.arguments).toContain("app-server");
    expect(packet.launch.arguments).not.toContain("--dangerously-bypass-hook-trust");
    expect(packet.launch.protocol.thread).toMatchObject({
      approvalPolicy: "on-request",
      permissions: ":read-only",
      modelProvider: CODEX_MODEL_PROVIDER_ID,
    });
    expect(packet.model).toEqual({
      id: "gpt-5.6-sol",
      reasoningEffort: "medium",
      launchLimit: 1,
    });
    expect(packet.permissions).toBeUndefined();
    expect(probeCodexAppServerFileChangeApproval).toHaveBeenCalledOnce();
    expect(context.harness.counters).toMatchObject({
      proposal: 3,
      approval: 3,
      activation: 1,
    });
    expect(CODEX_RESTRICTED_RUNTIME_OVERRIDES).toContain('cli_auth_credentials_store="file"');

    const replayProbe = vi.fn(() => {
      throw new Error("重放不得再次执行 Host Preflight");
    });
    const replay = await previewCodexAgentPilotHost(
      {
        root: fixture.input.root,
        stateDigest: context.current.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(context.harness.runEnvelope, {
        probeCodexAppServerFileChangeApproval: replayProbe,
      }),
    );
    expect(replay).toMatchObject({
      stateDigest: final.stateDigest,
      hostApprovalPacketDigest: packetDigest,
      replayed: true,
    });
    expect(replayProbe).not.toHaveBeenCalled();
    expect(await readStateChain(context.prepared.paths.stateRoot)).toHaveLength(5);
  });

  it("主仓身份检查只排除精确受管 Worktree 路径", async () => {
    const context = await createWaitingHostContext();
    const repositoryStatusCalls = [];
    const runGit = (cwd, args) => {
      if (args[0] !== "status") return context.current.fixedProject.revision;
      if (cwd !== context.current.paths.repositoryRoot) return "";
      repositoryStatusCalls.push(args);
      return args.includes(":(exclude)worktrees/codex-agent-pilot") ? "" : "?? worktrees/";
    };

    await previewCodexAgentPilotHost(
      {
        root: fixture.input.root,
        stateDigest: context.current.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(context.harness.runEnvelope, {
        runGit,
        probeCodexAppServerFileChangeApproval: async () =>
          createCodexAppServerPreflightFixture(context.current),
      }),
    );

    expect(repositoryStatusCalls).toHaveLength(2);
    expect(
      repositoryStatusCalls.every((args) => args.includes(":(exclude)worktrees/codex-agent-pilot")),
    ).toBe(true);
  });

  it("预检证据不匹配固定 Codex identity 时 fail closed", async () => {
    const context = await createWaitingHostContext();
    const evidence = createCodexAppServerPreflightFixture(context.current);
    evidence.codexVersion = "drifted";

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, {
          probeCodexAppServerFileChangeApproval: async () => evidence,
        }),
      ),
    ).rejects.toThrow("Preflight Codex identity");
    expect(await readStateChain(context.prepared.paths.stateRoot)).toHaveLength(4);
    expect(
      (await readdir(context.prepared.paths.controlRoot)).filter((name) =>
        name.startsWith("hostApprovalPacket-"),
      ),
    ).toEqual([]);
  });

  it("Candidate Hook 兼容性 Artifact 漂移在预检前即被拒绝", async () => {
    const context = await createWaitingHostContext();
    const candidateFile = context.current.activation.candidateConfigFile;
    const candidateConfig = JSON.parse(await readFile(candidateFile, "utf8"));
    candidateConfig.hooks.PreToolUse[0].matcher = "^other$";
    await writeFile(candidateFile, `${JSON.stringify(candidateConfig, null, 2)}\n`, "utf8");
    const probe = vi.fn();

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, {
          probeCodexAppServerFileChangeApproval: probe,
        }),
      ),
    ).rejects.toThrow("摘要");
    expect(probe).not.toHaveBeenCalled();
  });

  it("Host 预检严格绑定当前 stateDigest 与 Human actor", async () => {
    const context = await createWaitingHostContext();
    const probe = vi.fn();

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: "sha256:wrong",
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, {
          probeCodexAppServerFileChangeApproval: probe,
        }),
      ),
    ).rejects.toThrow("stateDigest");
    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "other-human",
        },
        fixture.dependencies(context.harness.runEnvelope, {
          probeCodexAppServerFileChangeApproval: probe,
        }),
      ),
    ).rejects.toThrow("actor");
    expect(probe).not.toHaveBeenCalled();
  });

  it("目标文件摘要漂移在本地预检前被拒绝", async () => {
    const context = await createWaitingHostContext();
    await writeFile(context.current.activation.targetFile, "漂移后的目标内容\n", "utf8");
    const probe = vi.fn();

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, {
          probeCodexAppServerFileChangeApproval: probe,
        }),
      ),
    ).rejects.toThrow("摘要");
    expect(probe).not.toHaveBeenCalled();
  });

  it("本地预检期间目标漂移会阻止审批包落盘", async () => {
    const context = await createWaitingHostContext();
    const probe = vi.fn(async () => {
      await writeFile(context.current.activation.targetFile, "预检期间漂移\n", "utf8");
      return createCodexAppServerPreflightFixture(context.current);
    });

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, {
          probeCodexAppServerFileChangeApproval: probe,
        }),
      ),
    ).rejects.toThrow("摘要");
    expect(probe).toHaveBeenCalledOnce();
  });
});

async function createWaitingHostContext() {
  fixture = await createCodexAgentPilotFixture();
  const harness = createHappyPathPilotEnvelope(fixture);
  const prepared = await prepareCodexAgentPilot(
    fixture.input,
    fixture.dependencies(harness.runEnvelope),
  );
  let stateDigest = prepared.stateDigest;
  for (let index = 0; index < 3; index += 1) {
    const next = await approveCodexAgentPilot(
      { root: fixture.input.root, stateDigest, actorId: "human-actor" },
      fixture.dependencies(harness.runEnvelope),
    );
    stateDigest = next.stateDigest;
  }
  const current = (await readStateChain(prepared.paths.stateRoot)).at(-1);
  return { prepared, current, harness };
}
