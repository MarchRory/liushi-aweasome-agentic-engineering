import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { setImmediate } from "node:timers";

import { describe, expect, it, vi } from "vitest";

import { runCodexAgentAppServer } from "../../../scripts/codexAgentPilot/host/agentRunner/appServer/index.mjs";

const TARGET_PATH = "C:\\worktree\\src\\target.ts";
const OUTSIDE_PATH = "C:\\worktree\\src\\outside.ts";
const CODEX_EXECUTABLE = "C:\\approved-tools\\codex-0.145.0\\codex.exe";
const CODEX_ARGUMENTS = Object.freeze([
  "-c",
  'model_provider="openai"',
  "-c",
  "model_providers.openai={supports_websockets=false}",
  "--strict-config",
  "app-server",
  "--stdio",
]);

describe("Codex app-server file-change runner", () => {
  it("strictly sequences JSONL and accepts one approved update", async () => {
    const fake = createFakeAppServer();
    const spawnProcess = vi.fn(() => fake.child);
    const authorizeFileChange = vi.fn(async () => ({
      approved: true,
      evidence: { source: "unit-test" },
    }));
    const input = createInput({ authorizeFileChange });

    const result = await runCodexAgentAppServer(input, {
      spawnProcess,
      terminateProcessTree: vi.fn(),
    });

    expect(fake.messages.map((message) => message.method ?? message.result?.decision)).toEqual([
      "initialize",
      "initialized",
      "thread/start",
      "turn/start",
      "accept",
    ]);
    expect(fake.messages[2].params).toMatchObject({
      model: "luna-max",
      modelProvider: "openai",
      cwd: "C:\\worktree",
      runtimeWorkspaceRoots: ["C:\\worktree"],
      approvalPolicy: "on-request",
      permissions: ":read-only",
      ephemeral: true,
    });
    expect(fake.messages[3].params).toMatchObject({
      threadId: "thread-1",
      model: "luna-max",
      modelProvider: "openai",
      approvalPolicy: "on-request",
      permissions: ":read-only",
    });
    expect(fake.messages[4].result).toEqual({ decision: "accept" });
    expect(authorizeFileChange).toHaveBeenCalledOnce();
    expect(authorizeFileChange.mock.calls[0][0]).toEqual({
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      changes: [{ path: TARGET_PATH, kind: "update" }],
      grantRoot: null,
    });
    expect(spawnProcess).toHaveBeenCalledWith(
      input.executable,
      input.arguments,
      expect.objectContaining({
        cwd: "C:\\worktree",
        env: input.environment,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    expect(spawnProcess.mock.calls[0][0]).toBe(input.executable);
    expect(spawnProcess.mock.calls[0][1]).toBe(input.arguments);
    expect(spawnProcess.mock.calls[0][2].env).toBe(input.environment);
    expect(result).toMatchObject({
      status: "succeeded",
      outcome: "succeeded",
      process: {
        processStarted: true,
        processMayBeRunning: false,
        exitCode: 0,
        timedOut: false,
        outputLimitExceeded: false,
        stderrLimitExceeded: false,
      },
      protocolEvidence: {
        threadId: "thread-1",
        turnId: "turn-1",
        approvedCount: 1,
        cancelledCount: 0,
        completedFileChangeCount: 1,
        threadStatusTransitions: [
          { type: "active", activeFlags: [] },
          { type: "active", activeFlags: ["waitingOnApproval"] },
          { type: "active", activeFlags: [] },
          { type: "idle" },
        ],
        authorizations: [
          {
            itemId: "item-1",
            decision: "accept",
            evidenceDigest: digestCanonicalJson('{"source":"unit-test"}'),
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret prompt");
    expect(JSON.stringify(result)).not.toContain("secret diff");
  });

  it.each([
    ["missing executable", { executable: undefined }, /executable/u],
    ["relative executable", { executable: "codex.exe" }, /absolute/u],
    ["NUL executable", { executable: "C:\\tools\\codex\0.exe" }, /NUL/u],
  ])("fails closed before spawn for %s", async (_label, override, expected) => {
    const spawnProcess = vi.fn();

    await expect(runCodexAgentAppServer(createInput(override), { spawnProcess })).rejects.toThrow(
      expected,
    );

    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it.each([
    ["missing arguments", { arguments: undefined }],
    ["empty arguments", { arguments: [] }],
    ["empty argument", { arguments: ["", "--strict-config", "app-server", "--stdio"] }],
    ["blank argument", { arguments: [" ", "--strict-config", "app-server", "--stdio"] }],
    [
      "NUL argument",
      { arguments: ["-c", "bad\0value", "--strict-config", "app-server", "--stdio"] },
    ],
    ["legacy tail", { arguments: ["app-server", "--stdio"] }],
    [
      "bypass approvals and sandbox",
      {
        arguments: ["--dangerously-bypass-approvals-and-sandbox", ...CODEX_ARGUMENTS],
      },
    ],
    [
      "bypass hook trust",
      {
        arguments: ["--dangerously-bypass-hook-trust=true", ...CODEX_ARGUMENTS],
      },
    ],
  ])("fails closed before spawn for invalid arguments: %s", async (_label, override) => {
    const spawnProcess = vi.fn();

    await expect(runCodexAgentAppServer(createInput(override), { spawnProcess })).rejects.toThrow(
      /arguments|bypass|strict-config/u,
    );

    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("replays a stable canonical authorization evidence digest", async () => {
    const evidenceValues = [
      { z: 3, a: { y: 2, x: 1 } },
      { a: { x: 1, y: 2 }, z: 3 },
    ];
    const results = await Promise.all(
      evidenceValues.map(async (evidence) => {
        const fake = createFakeAppServer();
        return runCodexAgentAppServer(
          createInput({
            authorizeFileChange: async () => ({ approved: true, evidence }),
          }),
          { spawnProcess: () => fake.child, terminateProcessTree: vi.fn() },
        );
      }),
    );
    const expectedDigest = digestCanonicalJson('{"a":{"x":1,"y":2},"z":3}');

    expect(
      results.map((result) => result.protocolEvidence.authorizations[0]?.evidenceDigest),
    ).toEqual([expectedDigest, expectedDigest]);
    expect(results[0].protocolEvidence.authorizations).toEqual([
      { itemId: "item-1", decision: "accept", evidenceDigest: expectedDigest },
    ]);
  });

  it("cancels and fails closed for an out-of-allowlist file change", async () => {
    const fake = createFakeAppServer({ filePath: OUTSIDE_PATH });
    const terminateProcessTree = createTerminator(fake);
    const authorizeFileChange = vi.fn();

    const error = await runCodexAgentAppServer(createInput({ authorizeFileChange }), {
      spawnProcess: () => fake.child,
      terminateProcessTree,
    }).then(
      () => null,
      (cause) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      protocolEvidence: {
        authorizations: [
          {
            itemId: "item-1",
            decision: "cancel",
            evidenceDigest: digestCanonicalJson('{"reason":"proposal-rejected"}'),
          },
        ],
      },
    });
    expect(error.message).toMatch(/validation/u);
    expect(fake.messages.at(-1)).toMatchObject({ result: { decision: "cancel" } });
    expect(authorizeFileChange).not.toHaveBeenCalled();
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it.each([
    ["string kind", "update"],
    ["move_path", { type: "update", move_path: "C:\\worktree\\src\\moved.ts" }],
    ["movePath", { type: "update", movePath: "C:\\worktree\\src\\moved.ts" }],
  ])("rejects unsupported 0.145.0 change shape: %s", async (_label, changeKind) => {
    const fake = createFakeAppServer({ changeKind });
    const terminateProcessTree = createTerminator(fake);

    const error = await runCodexAgentAppServer(createInput(), {
      spawnProcess: () => fake.child,
      terminateProcessTree,
    }).then(
      () => null,
      (cause) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/validation/u);
    expect(error).toMatchObject({
      protocolEvidence: {
        authorizations: [
          {
            itemId: "item-1",
            decision: "cancel",
            evidenceDigest: digestCanonicalJson('{"reason":"proposal-rejected"}'),
          },
        ],
      },
    });
    expect(fake.messages.at(-1)).toMatchObject({ result: { decision: "cancel" } });
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("returns a protocol error for an unknown server request", async () => {
    const fake = createFakeAppServer({ unknownRequest: true });
    const terminateProcessTree = createTerminator(fake);

    await expect(
      runCodexAgentAppServer(createInput(), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toThrow(/unknown server request/u);

    expect(fake.messages.at(-1)).toMatchObject({
      id: 77,
      error: { code: -32601 },
    });
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("仅接受明确 disabled 的 remote control 状态", async () => {
    const fake = createFakeAppServer({ remoteControlStatus: "enabled" });
    const terminateProcessTree = createTerminator(fake);

    await expect(
      runCodexAgentAppServer(createInput(), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toThrow("remote control must remain disabled");
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("拒绝受限协议未允许的 thread active flag", async () => {
    const fake = createFakeAppServer({ activeFlags: ["subAgent"] });
    const terminateProcessTree = createTerminator(fake);

    await expect(
      runCodexAgentAppServer(createInput(), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toThrow("thread active flags are not allowed by the restricted protocol");
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("拒绝需要用户输入的 thread active flag", async () => {
    const fake = createFakeAppServer({ activeFlags: ["waitingOnUserInput"] });
    const terminateProcessTree = createTerminator(fake);

    await expect(
      runCodexAgentAppServer(createInput(), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toThrow("thread active flags are not allowed by the restricted protocol");
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it.each([
    ["重复初始 active", { duplicateInitialActive: true }],
    ["过早 idle", { earlyIdle: true }],
    ["缺少审批完成后的 active 清空", { omitClearedStatus: true }],
  ])("拒绝无效 thread 状态序列：%s", async (_label, scenario) => {
    const fake = createFakeAppServer(scenario);
    const terminateProcessTree = createTerminator(fake);

    await expect(
      runCodexAgentAppServer(createInput(), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toThrow("thread status transition sequence is invalid");
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing prior item", { missingItem: true }, /without a prior item/u],
    ["duplicate item", { duplicateItem: true }, /item\/started was repeated/u],
  ])("rejects %s and terminates the child", async (_label, scenario, expected) => {
    const fake = createFakeAppServer(scenario);
    const terminateProcessTree = createTerminator(fake);

    await expect(
      runCodexAgentAppServer(createInput(), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toThrow(expected);

    expect(terminateProcessTree).toHaveBeenCalledOnce();
    if (scenario.missingItem) {
      expect(fake.messages.at(-1)).toMatchObject({ result: { decision: "cancel" } });
    }
  });

  it("cancels and fails when authorizeFileChange throws", async () => {
    const fake = createFakeAppServer();
    const terminateProcessTree = createTerminator(fake);
    const authorizeFileChange = vi.fn(async () => {
      throw new Error("policy callback exploded");
    });

    const error = await runCodexAgentAppServer(createInput({ authorizeFileChange }), {
      spawnProcess: () => fake.child,
      terminateProcessTree,
    }).then(
      () => null,
      (cause) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/authorizeFileChange failed/u);
    expect(error).toMatchObject({
      protocolEvidence: {
        authorizations: [
          {
            itemId: "item-1",
            decision: "cancel",
            evidenceDigest: digestCanonicalJson('{"reason":"callback-error"}'),
          },
        ],
      },
    });
    expect(fake.messages.at(-1)).toMatchObject({ result: { decision: "cancel" } });
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it.each([
    ["non-object result", null, "invalid-authorization"],
    ["missing approval evidence", { approved: true }, "missing-evidence"],
    ["non-JSON approval evidence", { approved: true, evidence: new Date(0) }, "invalid-evidence"],
  ])("cancels an invalid authorization: %s", async (_label, authorization, reason) => {
    const fake = createFakeAppServer();
    const terminateProcessTree = createTerminator(fake);

    const error = await runCodexAgentAppServer(
      createInput({ authorizeFileChange: async () => authorization }),
      { spawnProcess: () => fake.child, terminateProcessTree },
    ).then(
      () => null,
      (cause) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      protocolEvidence: {
        authorizations: [
          {
            itemId: "item-1",
            decision: "cancel",
            evidenceDigest: digestCanonicalJson(`{"reason":"${reason}"}`),
          },
        ],
      },
    });
    expect(fake.messages.at(-1)).toMatchObject({ result: { decision: "cancel" } });
    expect(terminateProcessTree).toHaveBeenCalledOnce();
  });

  it("returns structured denied for an explicit policy rejection", async () => {
    const fake = createFakeAppServer();
    const terminateProcessTree = createTerminator(fake);

    const result = await runCodexAgentAppServer(
      createInput({
        authorizeFileChange: async () => ({ approved: false, evidence: { source: "policy" } }),
      }),
      { spawnProcess: () => fake.child, terminateProcessTree },
    );

    expect(result).toMatchObject({
      status: "denied",
      outcome: "denied",
      process: { processMayBeRunning: false, terminationReason: "policy-denied" },
      protocolEvidence: {
        approvedCount: 0,
        cancelledCount: 1,
        authorizations: [
          {
            itemId: "item-1",
            decision: "cancel",
            evidenceDigest: digestCanonicalJson('{"source":"policy"}'),
          },
        ],
      },
    });
    expect(fake.messages.at(-1)).toMatchObject({ result: { decision: "cancel" } });
  });

  it("returns interrupted only after a confirmed timeout termination", async () => {
    const fake = createFakeAppServer({ ignoreInitialize: true });
    const terminateProcessTree = createTerminator(fake);

    const result = await runCodexAgentAppServer(
      createInput({ timeoutMs: 10, terminationConfirmationTimeoutMs: 50 }),
      { spawnProcess: () => fake.child, terminateProcessTree },
    );

    expect(result).toMatchObject({
      status: "interrupted",
      process: {
        timedOut: true,
        processMayBeRunning: false,
        terminationReason: "timeout",
      },
    });
  });

  it("enforces stdout and stderr limits without returning their contents", async () => {
    const stdoutFake = createFakeAppServer({ output: "x".repeat(32) });
    const stdoutResult = await runCodexAgentAppServer(createInput({ outputLimitBytes: 16 }), {
      spawnProcess: () => stdoutFake.child,
      terminateProcessTree: createTerminator(stdoutFake),
    });
    expect(stdoutResult).toMatchObject({
      status: "interrupted",
      process: { outputLimitExceeded: true, processMayBeRunning: false },
    });
    expect(JSON.stringify(stdoutResult)).not.toContain("xxxxxxxx");

    const stderrFake = createFakeAppServer({ stderr: "e".repeat(32) });
    const stderrResult = await runCodexAgentAppServer(createInput({ stderrLimitBytes: 16 }), {
      spawnProcess: () => stderrFake.child,
      terminateProcessTree: createTerminator(stderrFake),
    });
    expect(stderrResult).toMatchObject({
      status: "interrupted",
      process: { stderrLimitExceeded: true, processMayBeRunning: false },
    });
  });

  it("reports outcomeUnknown when process-tree termination cannot be confirmed", async () => {
    const fake = createFakeAppServer({ ignoreInitialize: true });
    const terminationError = new Error("termination denied");
    const terminateProcessTree = vi.fn(async () => {
      throw terminationError;
    });

    await expect(
      runCodexAgentAppServer(createInput({ timeoutMs: 10 }), {
        spawnProcess: () => fake.child,
        terminateProcessTree,
      }),
    ).rejects.toMatchObject({
      processStarted: true,
      processMayBeRunning: true,
      outcomeUnknown: true,
      cause: terminationError,
    });
  });
});

function createInput(overrides = {}) {
  return {
    executable: CODEX_EXECUTABLE,
    arguments: [...CODEX_ARGUMENTS],
    prompt: "secret prompt",
    model: "luna-max",
    modelProvider: "openai",
    cwd: "C:\\worktree",
    runtimeWorkspaceRoots: ["C:\\worktree"],
    allowedPaths: [TARGET_PATH],
    environment: { PATH: "C:\\minimal-bin", CODEX_HOME: "C:\\isolated" },
    authorizeFileChange: async () => ({ approved: true, evidence: "unit" }),
    timeoutMs: 500,
    terminationConfirmationTimeoutMs: 50,
    ...overrides,
  };
}

function createTerminator(fake) {
  return vi.fn(async () => {
    fake.close(1, "SIGTERM");
  });
}

function createFakeAppServer(scenario = {}) {
  const child = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const messages = [];
  let inputBuffer = "";
  let closed = false;

  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      inputBuffer += chunk.toString("utf8");
      const lines = inputBuffer.split(/\r?\n/u);
      inputBuffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line);
        messages.push(message);
        handleClientMessage(message);
      }
      callback();
    },
    final(callback) {
      setImmediate(() => {
        if (!closed) close(0, null);
        callback();
      });
    },
  });

  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = vi.fn(() => true);
  child.exitCode = null;
  child.signalCode = null;

  if (scenario.output !== undefined) setImmediate(() => stdout.write(scenario.output));
  if (scenario.stderr !== undefined) setImmediate(() => stderr.write(scenario.stderr));

  return { child, messages, close };

  function handleClientMessage(message) {
    if (message.method === "initialize" && !scenario.ignoreInitialize) {
      send({ id: message.id, result: {} });
      send({
        method: "remoteControl/status/changed",
        params: {
          status: scenario.remoteControlStatus ?? "disabled",
          serverName: "unit-test",
          installationId: "installation-1",
          environmentId: null,
        },
      });
      return;
    }
    if (message.method === "thread/start") {
      send({ id: message.id, result: { thread: { id: "thread-1" } } });
      send({ method: "thread/started", params: { thread: { id: "thread-1" } } });
      return;
    }
    if (message.method === "turn/start") {
      send({ id: message.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
      send({
        method: "thread/status/changed",
        params: {
          threadId: "thread-1",
          status: { type: "active", activeFlags: scenario.activeFlags ?? [] },
        },
      });
      if (scenario.duplicateInitialActive) {
        sendThreadStatus({ type: "active", activeFlags: [] });
      }
      send({
        method: "turn/started",
        params: { threadId: "thread-1", turn: { id: "turn-1", status: "inProgress" } },
      });
      if (scenario.unknownRequest) {
        send({ id: 77, method: "unknown/serverRequest", params: {} });
      } else if (scenario.missingItem) {
        sendApprovalRequest("missing-item");
      } else {
        sendItemStarted(scenario.filePath ?? TARGET_PATH);
        if (scenario.duplicateItem) sendItemStarted(scenario.filePath ?? TARGET_PATH);
        else {
          sendThreadStatus(
            scenario.earlyIdle
              ? { type: "idle" }
              : { type: "active", activeFlags: ["waitingOnApproval"] },
          );
          sendApprovalRequest("item-1");
          sendPatchUpdated(scenario.filePath ?? TARGET_PATH);
        }
      }
    }
    if (message.result?.decision === "accept" && !scenario.duplicateItem) {
      send({
        method: "serverRequest/resolved",
        params: { requestId: 40 },
      });
      if (!scenario.omitClearedStatus) {
        sendThreadStatus({ type: "active", activeFlags: [] });
      }
      send({
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "item-1",
            type: "fileChange",
            changes: [createWireChange(scenario.filePath ?? TARGET_PATH)],
            status: "completed",
          },
        },
      });
      send({
        method: "account/rateLimits/updated",
        params: { rateLimits: { limitId: "unit-test" } },
      });
      send({
        method: "thread/status/changed",
        params: { threadId: "thread-1", status: { type: "idle" } },
      });
      send({
        method: "turn/completed",
        params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
      });
    }
  }

  function send(message) {
    setImmediate(() => {
      if (!closed) stdout.write(`${JSON.stringify(message)}\n`);
    });
  }

  function sendItemStarted(filePath) {
    send({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "item-1",
          type: "fileChange",
          changes: [createWireChange(filePath)],
          status: "inProgress",
        },
      },
    });
  }

  function sendPatchUpdated(filePath) {
    send({
      method: "item/fileChange/patchUpdated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        changes: [createWireChange(filePath)],
      },
    });
  }

  function createWireChange(filePath) {
    return {
      path: filePath,
      kind: scenario.changeKind ?? { type: "update", move_path: null },
      diff: "secret diff",
    };
  }

  function sendApprovalRequest(itemId) {
    send({
      id: 40,
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId,
        grantRoot: null,
      },
    });
  }

  function sendThreadStatus(status) {
    send({
      method: "thread/status/changed",
      params: { threadId: "thread-1", status },
    });
  }

  function close(code, signal) {
    if (closed) return;
    closed = true;
    child.exitCode = code;
    child.signalCode = signal;
    child.emit("close", code, signal);
    stdout.end();
    stderr.end();
  }
}

function digestCanonicalJson(canonicalJson) {
  return `sha256:${createHash("sha256").update(canonicalJson, "utf8").digest("hex")}`;
}
