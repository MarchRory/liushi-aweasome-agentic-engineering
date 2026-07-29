import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveCodexAgentPilot,
  approveCodexAgentPilotHost,
  prepareCodexAgentPilot,
  previewCodexAgentPilotHost,
} from "../../../scripts/codexAgentPilot/service/index.mjs";
import { validatePendingHostApprovalPilotState } from "../../../scripts/codexAgentPilot/service/shared/index.mjs";
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

describe("Codex Agent Pilot Host approval", () => {
  it("在 prepare -> G8/G1/G4 -> preview-host 后仅记录精确绑定的 Human approval", async () => {
    const context = await createWaitingHostContext();
    const inspectCodexHooks = vi.fn(() => {
      throw new Error("approve-host 不得调用 inspectCodexHooks");
    });
    const before = await readStateChain(context.prepared.paths.stateRoot);
    const approved = await approveCodexAgentPilotHost(
      approvalInput(context),
      fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
    );
    const states = await readStateChain(context.prepared.paths.stateRoot);
    const final = states.at(-1);

    expect(approved.status).toBe("host_approved");
    expect(final.status).toBe("host_approved");
    expect(final.hostApproval).toMatchObject({
      decision: "approved",
      sourceStateDigest: context.current.stateDigest,
      packetDigest: context.packet.packetDigest,
      actor: { kind: "human", actorId: "human-actor" },
      approvedAt: "2026-07-29T00:00:00.000Z",
      freshLaunchValidationRequired: true,
    });
    expect(final.pendingHostApproval).toMatchObject({
      ...context.current.pendingHostApproval,
      approved: true,
    });
    expect(final.transition).toMatchObject({
      kind: "host_approval",
      sourceStateDigest: context.current.stateDigest,
      packetDigest: context.packet.packetDigest,
      actorId: "human-actor",
    });
    expect(final.effects).toMatchObject({ modelLaunches: 0, hookWrites: 0 });
    expect(states).toHaveLength(before.length + 1);
    expect(inspectCodexHooks).not.toHaveBeenCalled();
    expect(context.harness.counters).toMatchObject({
      proposal: 3,
      approval: 3,
      activation: 1,
    });
  });

  it("相同 stateDigest、packetDigest、actor 的 Host approval 重放不追加 revision", async () => {
    const context = await createWaitingHostContext();
    const input = approvalInput(context);
    const first = await approveCodexAgentPilotHost(input, fixture.dependencies());
    const statesAfterFirst = await readStateChain(context.prepared.paths.stateRoot);
    const replay = await approveCodexAgentPilotHost(input, fixture.dependencies());

    expect(replay).toMatchObject({
      status: "host_approved",
      stateDigest: first.stateDigest,
      revision: first.revision,
    });
    expect(await readStateChain(context.prepared.paths.stateRoot)).toEqual(statesAfterFirst);
  });

  it.each([
    ["stateDigest", { stateDigest: "sha256:wrong" }, "stateDigest"],
    ["packetDigest", { packetDigest: "sha256:wrong" }, "packetDigest"],
    ["actor", { actorId: "other-human" }, "actor"],
  ])("拒绝错误的 %s，并保持零模型启动与零写入", async (_name, mutation, message) => {
    const context = await createWaitingHostContext();
    const inspectCodexHooks = vi.fn();
    await expect(
      approveCodexAgentPilotHost(
        { ...approvalInput(context), ...mutation },
        fixture.dependencies(context.harness.runEnvelope, { inspectCodexHooks }),
      ),
    ).rejects.toThrow(message);
    expect(await readStateChain(context.prepared.paths.stateRoot)).toHaveLength(5);
    expect((await readStateChain(context.prepared.paths.stateRoot)).at(-1).effects).toMatchObject({
      modelLaunches: 0,
      hookWrites: 0,
    });
    expect(inspectCodexHooks).not.toHaveBeenCalled();
  });

  it("拒绝不可变 packet 文件漂移", async () => {
    const context = await createWaitingHostContext();
    const packet = JSON.parse(await readFile(context.packetFile, "utf8"));
    packet.project.repositoryRevision = "drifted";
    await writeFile(context.packetFile, `${JSON.stringify(packet)}\n`, "utf8");
    await expect(
      approveCodexAgentPilotHost(approvalInput(context), fixture.dependencies()),
    ).rejects.toThrow(/packet|摘要/u);
  });

  it("拒绝 target snapshot 漂移", async () => {
    const context = await createWaitingHostContext();
    await writeFile(context.current.activation.targetFile, "target drift\n", "utf8");
    await expect(
      approveCodexAgentPilotHost(approvalInput(context), fixture.dependencies()),
    ).rejects.toThrow(/target|snapshot|目标文件快照/u);
  });

  it("拒绝 Codex identity 与 Worktree identity 漂移", async () => {
    const context = await createWaitingHostContext();
    await expect(
      approveCodexAgentPilotHost(
        approvalInput(context),
        fixture.dependencies(context.harness.runEnvelope, {
          readCodexVersion: () => "codex-cli drifted",
        }),
      ),
    ).rejects.toThrow("identity");

    const runGit = (cwd, args) => {
      if (args[0] === "status") {
        return cwd === context.current.activation.worktreeRoot ? " M test/utils.test.ts" : "";
      }
      return context.current.fixedProject.revision;
    };
    await expect(
      approveCodexAgentPilotHost(
        approvalInput(context),
        fixture.dependencies(context.harness.runEnvelope, { runGit }),
      ),
    ).rejects.toThrow(/clean|重建/u);
  });

  it("append CAS 冲突 fail closed，且不调用模型或 Hook 探测", async () => {
    const context = await createWaitingHostContext();
    const inspectCodexHooks = vi.fn();
    const appendDerivedState = vi.fn(async () => {
      throw new Error("append CAS conflict");
    });
    await expect(
      approveCodexAgentPilotHost(
        approvalInput(context),
        fixture.dependencies(context.harness.runEnvelope, {
          appendDerivedState,
          inspectCodexHooks,
        }),
      ),
    ).rejects.toThrow("append CAS conflict");
    expect(appendDerivedState).toHaveBeenCalledTimes(1);
    expect(inspectCodexHooks).not.toHaveBeenCalled();
    expect(await readStateChain(context.prepared.paths.stateRoot)).toHaveLength(5);
    expect(context.harness.counters).toMatchObject({ proposal: 3, approval: 3, activation: 1 });
  });

  it.each([
    ["packetDigest", "sha256:drifted"],
    ["actorId", "other-human"],
    ["sourceStateDigest", "sha256:drifted"],
  ])("拒绝 Host Preview transition.%s 漂移", async (field, value) => {
    const context = await createWaitingHostContext();
    const tampered = {
      ...context.current,
      transition: { ...context.current.transition, [field]: value },
    };

    expect(() =>
      validatePendingHostApprovalPilotState(tampered, {
        root: fixture.input.root,
      }),
    ).toThrow("pending Host Approval");
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
  const candidateConfig = JSON.parse(
    await readFile(current.activation.candidateConfigFile, "utf8"),
  );
  const preview = await previewCodexAgentPilotHost(
    { root: fixture.input.root, stateDigest, actorId: "human-actor" },
    fixture.dependencies(harness.runEnvelope, {
      inspectCodexHooks: async (input) => createHostProbe(input, candidateConfig),
    }),
  );
  const packetFile = preview.hostApprovalPacketFile;
  const packet = JSON.parse(await readFile(packetFile, "utf8"));
  return {
    prepared,
    current: (await readStateChain(prepared.paths.stateRoot)).at(-1),
    packet,
    packetFile,
    harness,
  };
}

function approvalInput(context) {
  return {
    root: fixture.input.root,
    stateDigest: context.current.stateDigest,
    packetDigest: context.packet.packetDigest,
    actorId: "human-actor",
  };
}

function createHostProbe(input, candidateConfig) {
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
      codexHome: input.codexHome,
      platformFamily,
      platformOs: process.platform,
      userAgent: "liushi-harness/0.145.0",
    },
    hooksListResponse: {
      data: [
        {
          cwd: input.cwd,
          hooks: events.map(([event, eventName, keySuffix, hash], index) => {
            const group = candidateConfig.hooks[event][0];
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
              trustStatus: input.arguments.some(
                (argument) => typeof argument === "string" && argument.startsWith("hooks.state="),
              )
                ? "trusted"
                : "untrusted",
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
