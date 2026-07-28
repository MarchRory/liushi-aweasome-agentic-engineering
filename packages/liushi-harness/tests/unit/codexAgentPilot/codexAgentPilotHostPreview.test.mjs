import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

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
  createHappyPathPilotEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot Host preview", () => {
  it("只读证明 SessionFlags Trust，并生成仍受 Human Gate 约束的精确审批包", async () => {
    const context = await createWaitingHostContext();
    const candidateConfig = JSON.parse(
      await readFile(context.current.activation.candidateConfigFile, "utf8"),
    );
    const temporaryHomes = [];
    const inspectCodexHooks = vi.fn(async (input) => {
      temporaryHomes.push(input.codexHome);
      return createHookProbe({
        input,
        candidateConfig,
        trustStatus: input.arguments.some(
          (argument) => typeof argument === "string" && argument.startsWith("hooks.state="),
        )
          ? "trusted"
          : "untrusted",
      });
    });

    const preview = await previewCodexAgentPilotHost(
      {
        root: fixture.input.root,
        stateDigest: context.current.stateDigest,
        actorId: "human-actor",
      },
      fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
    );

    const states = await readStateChain(context.prepared.paths.stateRoot);
    const final = states.at(-1);
    const packet = JSON.parse(await readFile(preview.hostApprovalPacketFile, "utf8"));
    const { packetDigest, ...packetBody } = packet;
    expect(states).toHaveLength(5);
    expect(final.status).toBe("waiting_host_approval");
    expect(final.pendingHostApproval).toEqual({
      packetDigest,
      humanActorId: "human-actor",
      approved: false,
    });
    expect(final.transition).toEqual({
      kind: "host_preview",
      sourceStateDigest: context.current.stateDigest,
      actorId: "human-actor",
      packetDigest,
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
    expect(packet.model).toEqual({ id: "gpt-5.6-sol", reasoningEffort: "medium" });
    expect(packet.hooks.discovered.map((hook) => hook.trustStatus)).toEqual(["trusted", "trusted"]);
    expect(packet.hooks).toMatchObject({
      source: "sessionFlags",
      persistentConfigWrites: 0,
      persistentTrustWrites: 0,
      trustBypassAllowed: false,
    });
    expect(packet.launch.executed).toBe(false);
    expect(packet.launch.arguments).toContain("--ignore-user-config");
    expect(packet.launch.arguments).toContain("--ignore-rules");
    expect(packet.launch.arguments).not.toContain("--dangerously-bypass-hook-trust");
    expect(inspectCodexHooks).toHaveBeenCalledTimes(2);
    expect(context.harness.counters).toMatchObject({
      proposal: 3,
      approval: 3,
      activation: 1,
    });
    for (const temporaryHome of temporaryHomes) {
      await expect(access(temporaryHome)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("Trust 未变为 trusted 时 fail closed，不写审批包或新状态", async () => {
    const context = await createWaitingHostContext();
    const candidateConfig = JSON.parse(
      await readFile(context.current.activation.candidateConfigFile, "utf8"),
    );
    const inspectCodexHooks = vi.fn(async (input) =>
      createHookProbe({ input, candidateConfig, trustStatus: "untrusted" }),
    );

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
      ),
    ).rejects.toThrow("metadata");
    expect(await readStateChain(context.prepared.paths.stateRoot)).toHaveLength(4);
    expect(
      (await readdir(context.prepared.paths.controlRoot)).filter((name) =>
        name.startsWith("hostApprovalPacket-"),
      ),
    ).toEqual([]);
  });

  it("Candidate Hook 漂移在启动 app-server 前即被拒绝", async () => {
    const context = await createWaitingHostContext();
    const candidateFile = context.current.activation.candidateConfigFile;
    const candidateConfig = JSON.parse(await readFile(candidateFile, "utf8"));
    candidateConfig.hooks.PreToolUse[0].matcher = "^other$";
    await writeFile(candidateFile, `${JSON.stringify(candidateConfig, null, 2)}\n`, "utf8");
    const inspectCodexHooks = vi.fn();

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
      ),
    ).rejects.toThrow("摘要");
    expect(inspectCodexHooks).not.toHaveBeenCalled();
  });

  it("Host 预检严格绑定当前 stateDigest 与 Human actor", async () => {
    const context = await createWaitingHostContext();
    const inspectCodexHooks = vi.fn();

    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: "sha256:wrong",
          actorId: "human-actor",
        },
        fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
      ),
    ).rejects.toThrow("stateDigest");
    await expect(
      previewCodexAgentPilotHost(
        {
          root: fixture.input.root,
          stateDigest: context.current.stateDigest,
          actorId: "other-human",
        },
        fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
      ),
    ).rejects.toThrow("actor");
    expect(inspectCodexHooks).not.toHaveBeenCalled();
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
  await mkdir(current.activation.worktreeRoot, { recursive: true });
  return { prepared, current, harness };
}

function createHookProbe(input) {
  const platformFamily = process.platform === "win32" ? "windows" : "unix";
  const sourcePath =
    platformFamily === "windows"
      ? "C:\\<session-flags>\\config.toml"
      : "/<session-flags>/config.toml";
  const events = [
    ["PreToolUse", "preToolUse", "pre_tool_use:0:0", "a"],
    ["PostToolUse", "postToolUse", "post_tool_use:0:0", "b"],
  ];
  return {
    initializeResult: {
      codexHome: input.input.codexHome,
      platformFamily,
      platformOs: process.platform,
      userAgent: "liushi-harness/0.145.0",
    },
    hooksListResponse: {
      data: [
        {
          cwd: input.input.cwd,
          hooks: events.map(([event, eventName, keySuffix, hash], index) => {
            const group = input.candidateConfig.hooks[event][0];
            const handler = group.hooks[0];
            return {
              key: `${sourcePath}:${keySuffix}`,
              eventName,
              handlerType: "command",
              matcher: group.matcher,
              command: platformFamily === "windows" ? handler.commandWindows : handler.command,
              timeoutSec: handler.timeout,
              statusMessage: handler.statusMessage,
              additionalContextLimit: null,
              sourcePath,
              source: "sessionFlags",
              pluginId: null,
              displayOrder: index,
              enabled: true,
              isManaged: false,
              currentHash: `sha256:${hash.repeat(64)}`,
              trustStatus: input.trustStatus,
            };
          }),
          warnings: [],
          errors: [],
        },
      ],
    },
    stderr: "",
  };
}
