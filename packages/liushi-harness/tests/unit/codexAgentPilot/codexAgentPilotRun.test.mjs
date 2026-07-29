import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateCanonicalJsonSha256 } from "../../../scripts/codexAgentPilot/host/agentRunner/appServer/index.mjs";
import {
  approveCodexAgentPilot,
  approveCodexAgentPilotHost,
  prepareCodexAgentPilot,
  previewCodexAgentPilotHost,
  runCodexAgentPilotAgent,
} from "../../../scripts/codexAgentPilot/service/index.mjs";
import {
  appendDerivedState,
  readStateChain,
} from "../../../scripts/codexAgentPilot/state/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
  createCodexAppServerPreflightFixture,
  createHappyPathPilotEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

const PROCESS_DIGEST = "a".repeat(64);
const CHANGE_DIGEST = "b".repeat(64);
let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot run-agent", () => {
  it("先落盘 Launch Intent，再以隔离环境完成一次精确审批并清理 Runtime", async () => {
    const context = await approvedContext();
    const observedStates = [];
    const runtime = createRuntimeDoubles();
    const runCodexAgentAppServer = vi.fn(async (input) => {
      observedStates.push((await readStateChain(context.prepared.paths.stateRoot)).at(-1));
      expect(input.environment).toEqual(runtime.environment);
      expect(input.executable).toBe(context.packet.launch.executable);
      expect(input.arguments).toEqual(context.packet.launch.arguments);
      const authorization = await authorizeTargetChange(input, context);
      return createRunnerResult({ authorization });
    });

    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer,
      inspectCodexAgentWorktreeChange: async () => ({
        inspected: true,
        valid: true,
        changedPaths: ["test/utils.test.ts"],
      }),
    });

    expect(runCodexAgentAppServer).toHaveBeenCalledOnce();
    expect(observedStates[0]).toMatchObject({ status: "agent_launching", revision: 7 });
    expect(runtime.prepare).toHaveBeenCalledOnce();
    expect(runtime.credentialSourceValidator).toHaveBeenCalledOnce();
    expect(runtime.externalSecurity).toHaveBeenCalledWith({
      hostHome: context.packet.runtimeIsolation.plan.profileHome,
      worktreeRoot: context.current.activation.worktreeRoot,
    });
    expect(runtime.remove).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "waiting_closeout",
      record: {
        status: "passed",
        runnerOutcome: "succeeded",
        protocol: {
          valid: true,
          evidence: {
            approvedCount: 1,
            cancelledCount: 0,
          },
        },
        runtimeIsolation: {
          prepared: true,
          credentialSourceIntegrity: {
            status: "verified",
            checked: true,
          },
          cleanup: {
            status: "removed",
            attempted: true,
            removed: true,
            preserved: false,
          },
        },
      },
      agentExecution: { status: "passed" },
    });
    expect(
      (await readStateChain(context.prepared.paths.stateRoot)).at(-1).effects.modelLaunches,
    ).toBe(1);
  });

  it("runner denied 或协议失败不得晋级，但仍清理已退出进程的 Runtime", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer: async () =>
        createRunnerResult({
          outcome: "denied",
          terminationReason: "policy-denied",
          approvedCount: 0,
          cancelledCount: 1,
          completedFileChangeCount: 0,
          authorization: {
            itemId: "item-1",
            decision: "cancel",
            evidenceDigest: calculateCanonicalJsonSha256({ reason: "policy-denied" }),
          },
        }),
    });

    expect(result).toMatchObject({
      status: "agent_failed",
      record: {
        status: "failed",
        runnerOutcome: "denied",
        runtimeIsolation: { cleanup: { status: "removed" } },
      },
    });
    expect(runtime.remove).toHaveBeenCalledOnce();
  });

  it.each([
    ["non-zero", { exitCode: 7 }],
    ["timeout", { outcome: "interrupted", timedOut: true, terminationReason: "timeout" }],
    [
      "output-limit",
      {
        outcome: "interrupted",
        outputLimitExceeded: true,
        terminationReason: "output-limit",
      },
    ],
    [
      "stderr-limit",
      {
        outcome: "interrupted",
        stderrLimitExceeded: true,
        terminationReason: "stderr-limit",
      },
    ],
  ])("%s -> agent_failed", async (_name, mutation) => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer: async (input) => {
        const authorization = await authorizeTargetChange(input, context);
        return createRunnerResult({ authorization, ...mutation });
      },
    });
    expect(result.status).toBe("agent_failed");
    expect(runtime.remove).toHaveBeenCalledOnce();
  });

  it("processMayBeRunning 时保留 Runtime、跳过 Worktree 检查并禁止自动重启", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const inspect = vi.fn();
    const runCodexAgentAppServer = vi.fn(async () => {
      const error = new Error("termination unknown");
      error.processStarted = true;
      error.processMayBeRunning = true;
      error.timedOut = true;
      error.terminationReason = "timeout";
      throw error;
    });
    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer,
      inspectCodexAgentWorktreeChange: inspect,
    });

    expect(result).toMatchObject({
      status: "agent_outcome_unknown",
      record: {
        status: "outcome_unknown",
        process: {
          processMayBeRunning: true,
          timedOut: true,
          terminationReason: "timeout",
        },
        runtimeIsolation: {
          credentialSourceIntegrity: {
            status: "preserved_unknown_process",
            checked: false,
          },
          cleanup: {
            status: "preserved_unknown_process",
            attempted: false,
            preserved: true,
          },
        },
      },
    });
    expect(runtime.remove).not.toHaveBeenCalled();
    expect(runtime.credentialSourceValidator).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    await expect(
      runAgent(context, {
        ...runtime.dependencies,
        runCodexAgentAppServer,
      }),
    ).resolves.toMatchObject({ replayed: true, status: "agent_outcome_unknown" });
    expect(runCodexAgentAppServer).toHaveBeenCalledOnce();
  });

  it("宿主 auth 漂移时记录失败、清理 Runtime 且阻止晋级", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles({
      assertCodexAgentAuthSourceStable: vi.fn(async () => {
        throw new Error("host auth drift");
      }),
    });
    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer: async (input) => {
        const authorization = await authorizeTargetChange(input, context);
        return createRunnerResult({ authorization });
      },
    });

    expect(result).toMatchObject({
      status: "agent_failed",
      record: {
        runnerOutcome: "failed",
        error: {
          phase: "runtime_credential_source_validation",
          message: "host auth drift",
        },
        runtimeIsolation: {
          credentialSourceIntegrity: {
            status: "failed",
            checked: true,
            error: { message: "host auth drift" },
          },
          cleanup: { status: "removed", removed: true },
        },
      },
    });
    expect(runtime.credentialSourceValidator).toHaveBeenCalledOnce();
    expect(runtime.remove).toHaveBeenCalledOnce();
  });

  it("Runtime 清理失败会保留审计证据并阻止晋级", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles({
      removeCodexAgentRuntime: vi.fn(async () => {
        throw new Error("cleanup failed");
      }),
    });
    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer: async (input) => {
        const authorization = await authorizeTargetChange(input, context);
        return createRunnerResult({ authorization });
      },
    });

    expect(result).toMatchObject({
      status: "agent_failed",
      record: {
        runnerOutcome: "failed",
        runtimeIsolation: {
          cleanup: {
            status: "failed",
            attempted: true,
            removed: false,
            preserved: true,
            error: { message: "cleanup failed" },
          },
        },
      },
    });
  });

  it("外部 Skill/Config 检查失败时启动零次并清理已准备的 Runtime", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles({
      assertNoExternalAgentSkills: vi.fn(async () => {
        throw new Error("external config found");
      }),
    });
    const runner = vi.fn();
    const result = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer: runner,
    });

    expect(result).toMatchObject({
      status: "agent_failed",
      record: {
        process: { processStarted: false },
        runtimeIsolation: { cleanup: { status: "removed" } },
      },
    });
    expect(runner).not.toHaveBeenCalled();
    expect(runtime.remove).toHaveBeenCalledOnce();
  });

  it.each([
    ["wrong actor", { actorId: "other-human" }],
    ["wrong packet", { packetDigest: "sha256:wrong" }],
    ["wrong state", { stateDigest: "sha256:wrong" }],
  ])("%s 在所有 Runtime/模型副作用前拒绝", async (_name, mutation) => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const runner = vi.fn();
    await expect(
      runCodexAgentPilotAgent(
        { ...runInput(context), ...mutation },
        context.fixture.dependencies(undefined, {
          ...runtime.dependencies,
          runCodexAgentAppServer: runner,
        }),
      ),
    ).rejects.toThrow();
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  it("Host approval 缺失时启动零次", async () => {
    const context = await approvedContext();
    const states = await readStateChain(context.prepared.paths.stateRoot);
    const runtime = createRuntimeDoubles();
    const runner = vi.fn();
    await expect(
      runCodexAgentPilotAgent(
        {
          ...runInput(context),
          stateDigest: states[3].stateDigest,
        },
        context.fixture.dependencies(undefined, {
          ...runtime.dependencies,
          runCodexAgentAppServer: runner,
        }),
      ),
    ).rejects.toThrow();
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  it("Launch Intent 后 identity 漂移 -> agent_failed 且模型启动零次", async () => {
    const context = await approvedContext();
    let appendCount = 0;
    const append = async (...args) => {
      const result = await appendDerivedState(...args);
      appendCount += 1;
      if (appendCount === 1) await writeFile(context.fixture.input.codex, "drift", "utf8");
      return result;
    };
    const runtime = createRuntimeDoubles();
    const runner = vi.fn();
    const result = await runAgent(context, {
      ...runtime.dependencies,
      appendDerivedState: append,
      runCodexAgentAppServer: runner,
    });
    expect(result.status).toBe("agent_failed");
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  it("相同输入重放不追加、不重启、不重新准备 Runtime", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const runner = vi.fn(async (input) => {
      const authorization = await authorizeTargetChange(input, context);
      return createRunnerResult({ authorization });
    });
    const overrides = { ...runtime.dependencies, runCodexAgentAppServer: runner };
    const first = await runAgent(context, overrides);
    const before = await readStateChain(context.prepared.paths.stateRoot);
    const replay = await runAgent(context, overrides);

    expect(replay).toMatchObject({ replayed: true, stateDigest: first.stateDigest });
    expect(runner).toHaveBeenCalledOnce();
    expect(runtime.prepare).toHaveBeenCalledOnce();
    expect(await readStateChain(context.prepared.paths.stateRoot)).toEqual(before);
  });

  it("final append 失败后从 execution record 恢复，禁止重启模型", async () => {
    const context = await approvedContext();
    let calls = 0;
    const append = async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error("final append failed");
      return appendDerivedState(...args);
    };
    const runtime = createRuntimeDoubles();
    const runner = vi.fn(async (input) => {
      const authorization = await authorizeTargetChange(input, context);
      return createRunnerResult({ authorization });
    });
    await expect(
      runAgent(context, {
        ...runtime.dependencies,
        appendDerivedState: append,
        runCodexAgentAppServer: runner,
      }),
    ).rejects.toThrow("final append failed");
    const recovered = await runAgent(context, {
      ...runtime.dependencies,
      runCodexAgentAppServer: runner,
    });

    expect(recovered).toMatchObject({ recovered: true, status: "waiting_closeout" });
    expect(runner).toHaveBeenCalledOnce();
  });

  it("AgentLaunching 且 execution record 缺失时拒绝自动重启", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const runner = vi.fn();
    const append = vi.fn(async (...args) => {
      const result = await appendDerivedState(...args);
      if (args[1].status === "agent_launching") throw new Error("stop after intent");
      return result;
    });
    await expect(
      runAgent(context, {
        ...runtime.dependencies,
        appendDerivedState: append,
        runCodexAgentAppServer: runner,
      }),
    ).rejects.toThrow("stop after intent");
    await expect(
      runAgent(context, {
        ...runtime.dependencies,
        runCodexAgentAppServer: runner,
      }),
    ).rejects.toThrow(/outcome unknown|禁止自动重启模型/u);
    expect(runner).not.toHaveBeenCalled();
  });

  it("两个并发调用只产生一个 Launch Intent 和一次模型启动", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const runner = vi.fn(async (input) => {
      await setTimeout(20);
      const authorization = await authorizeTargetChange(input, context);
      return createRunnerResult({ authorization });
    });
    const overrides = { ...runtime.dependencies, runCodexAgentAppServer: runner };
    const results = await Promise.allSettled([
      runAgent(context, overrides),
      runAgent(context, overrides),
    ]);
    const states = await readStateChain(context.prepared.paths.stateRoot);

    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(runner).toHaveBeenCalledOnce();
    expect(states.filter((state) => state.status === "agent_launching")).toHaveLength(1);
    expect(states.filter((state) => state.status === "waiting_closeout")).toHaveLength(1);
  });

  it("Intent append CAS conflict 时所有执行副作用为零", async () => {
    const context = await approvedContext();
    const runtime = createRuntimeDoubles();
    const runner = vi.fn();
    await expect(
      runAgent(context, {
        ...runtime.dependencies,
        appendDerivedState: async () => {
          throw new Error("CAS conflict");
        },
        runCodexAgentAppServer: runner,
      }),
    ).rejects.toThrow("CAS conflict");
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });
});

async function authorizeTargetChange(input, context) {
  const authorization = await input.authorizeFileChange({
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    changes: [{ path: context.current.activation.targetFile, kind: "update" }],
    grantRoot: null,
  });
  expect(authorization).toMatchObject({
    approved: true,
    evidence: {
      decision: "accept",
      packetDigest: context.packet.packetDigest,
      approvalDigest: context.approved.hostApproval.approvalDigest,
    },
  });
  return {
    itemId: "item-1",
    decision: "accept",
    evidenceDigest: calculateCanonicalJsonSha256(authorization.evidence),
  };
}

function createRunnerResult(input = {}) {
  const outcome = input.outcome ?? "succeeded";
  const terminationReason = input.terminationReason ?? null;
  const authorization = input.authorization ?? {
    itemId: "item-1",
    decision: input.approvedCount === 0 ? "cancel" : "accept",
    evidenceDigest: calculateCanonicalJsonSha256({ source: "test" }),
  };
  return {
    status: outcome,
    outcome,
    process: {
      processStarted: true,
      processMayBeRunning: false,
      outcomeUnknown: false,
      exitCode: input.exitCode ?? 0,
      signal: null,
      timedOut: input.timedOut ?? false,
      outputLimitExceeded: input.outputLimitExceeded ?? false,
      stderrLimitExceeded: input.stderrLimitExceeded ?? false,
      terminationReason,
      stdoutBytes: 128,
      stderrBytes: 0,
      stdoutDigest: PROCESS_DIGEST,
      stderrDigest: PROCESS_DIGEST,
    },
    protocolEvidence: {
      threadId: "thread-1",
      turnId: "turn-1",
      eventCount: 10,
      responseCount: 3,
      requestCount: 1,
      notificationCount: 6,
      methodCounts: {
        "item/completed": input.completedFileChangeCount === 0 ? 0 : 1,
        "item/fileChange/requestApproval": 1,
        "item/started": 1,
        "thread/started": 1,
        "turn/completed": 1,
        "turn/started": 1,
      },
      unknownMethodCount: 0,
      threadStatusTransitions: [
        { type: "active", activeFlags: [] },
        { type: "active", activeFlags: ["waitingOnApproval"] },
        { type: "active", activeFlags: [] },
        { type: "idle" },
      ],
      itemCount: 1,
      fileChangeItemCount: 1,
      completedFileChangeCount: input.completedFileChangeCount ?? 1,
      approvedCount: input.approvedCount ?? 1,
      cancelledCount: input.cancelledCount ?? 0,
      authorizations: [authorization],
      changeDigest: CHANGE_DIGEST,
    },
  };
}

function createRuntimeDoubles(overrides = {}) {
  const environment = Object.freeze({
    CODEX_HOME: "C:\\isolated\\codexHome",
    HOME: "C:\\isolated\\profileHome",
    NO_UPDATE_NOTIFIER: "1",
  });
  const prepare =
    overrides.prepareCodexAgentRuntime ??
    vi.fn(async (plan) => ({
      plan,
      env: environment,
      credentialSourceSnapshot: {
        path: plan.authSourceFile,
        size: 1,
        device: "1",
        inode: "2",
        modifiedAtMs: 1,
        changedAtMs: 1,
      },
    }));
  const remove =
    overrides.removeCodexAgentRuntime ??
    vi.fn(async (plan) => ({
      plan,
      removed: true,
    }));
  const externalSecurity = overrides.assertNoExternalAgentSkills ?? vi.fn(async () => undefined);
  const credentialSourceValidator =
    overrides.assertCodexAgentAuthSourceStable ?? vi.fn(async () => ({ verified: true }));
  return {
    environment,
    prepare,
    remove,
    externalSecurity,
    credentialSourceValidator,
    dependencies: {
      prepareCodexAgentRuntime: prepare,
      removeCodexAgentRuntime: remove,
      assertNoExternalAgentSkills: externalSecurity,
      assertCodexAgentAuthSourceStable: credentialSourceValidator,
    },
  };
}

function runInput(context) {
  return {
    root: context.fixture.input.root,
    stateDigest: context.approved.stateDigest,
    packetDigest: context.packet.packetDigest,
    actorId: "human-actor",
  };
}

function runAgent(context, overrides) {
  return runCodexAgentPilotAgent(
    runInput(context),
    context.fixture.dependencies(undefined, {
      inspectCodexAgentWorktreeChange: async () => ({
        inspected: true,
        valid: true,
        changedPaths: ["test/utils.test.ts"],
      }),
      ...overrides,
    }),
  );
}

async function approvedContext() {
  fixture = await createCodexAgentPilotFixture();
  const harness = createHappyPathPilotEnvelope(fixture);
  const prepared = await prepareCodexAgentPilot(
    fixture.input,
    fixture.dependencies(harness.runEnvelope),
  );
  let digest = prepared.stateDigest;
  for (let index = 0; index < 3; index += 1) {
    digest = (
      await approveCodexAgentPilot(
        { root: fixture.input.root, stateDigest: digest, actorId: "human-actor" },
        fixture.dependencies(harness.runEnvelope),
      )
    ).stateDigest;
  }
  const activationState = (await readStateChain(prepared.paths.stateRoot)).at(-1);
  const preview = await previewCodexAgentPilotHost(
    { root: fixture.input.root, stateDigest: digest, actorId: "human-actor" },
    fixture.dependencies(harness.runEnvelope, {
      probeCodexAppServerFileChangeApproval: async () =>
        createCodexAppServerPreflightFixture(activationState),
    }),
  );
  const packet = JSON.parse(await readFile(preview.hostApprovalPacketFile, "utf8"));
  const pending = (await readStateChain(prepared.paths.stateRoot)).at(-1);
  const approved = await approveCodexAgentPilotHost(
    {
      root: fixture.input.root,
      stateDigest: pending.stateDigest,
      packetDigest: packet.packetDigest,
      actorId: "human-actor",
    },
    fixture.dependencies(harness.runEnvelope),
  );
  return {
    fixture,
    prepared,
    current: activationState,
    packet,
    approved,
    harness,
  };
}
