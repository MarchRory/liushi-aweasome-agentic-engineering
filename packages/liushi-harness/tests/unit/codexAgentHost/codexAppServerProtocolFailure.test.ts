import { describe, expect, it, vi } from "vitest";

import {
  CodexAppServerTerminationReason,
  createCodexAppServerProtocol,
} from "../../../src/infrastructure/executors/codex/agentHost/appServer/index.js";

const TARGET_PATH = "C:\\worktree\\src\\target.ts";

describe("Codex App Server 协议失败边界", () => {
  it("拒绝非法 JSONL 且不把原始行写入错误链", async () => {
    const fixture = createProtocolFixture();

    fixture.protocol.start();
    await fixture.protocol.handleLine('{"credential":"sensitive-value"');

    expect(fixture.protocol.getFailure()).toBeInstanceOf(Error);
    expect(String(fixture.protocol.getFailure())).toContain("invalid JSONL");
    expect(readErrorChain(fixture.protocol.getFailure())).not.toContain("sensitive-value");
    expect(fixture.requestTermination).toHaveBeenCalledWith(
      CodexAppServerTerminationReason.ProtocolError,
    );
  });

  it("拒绝未知 Notification", async () => {
    const fixture = createProtocolFixture();

    fixture.protocol.start();
    await fixture.protocol.handleLine(
      JSON.stringify({ method: "unknown/notification", params: {} }),
    );

    expect(fixture.protocol.getFailure()).toBeInstanceOf(Error);
    expect(String(fixture.protocol.getFailure())).toContain("unknown server notification");
    expect(fixture.requestTermination).toHaveBeenCalledWith(
      CodexAppServerTerminationReason.ProtocolError,
    );
  });

  it("拒绝未登记和重复的 Response ID", async () => {
    const unregistered = createProtocolFixture();
    unregistered.protocol.start();

    await unregistered.protocol.handleLine(
      JSON.stringify({ id: 2, result: { thread: { id: "thread-1" } } }),
    );

    expect(String(unregistered.protocol.getFailure())).toContain(
      "unknown or duplicate response id",
    );

    const duplicate = createProtocolFixture();
    duplicate.protocol.start();
    await duplicate.protocol.handleLine(JSON.stringify({ id: 1, result: {} }));
    await duplicate.protocol.handleLine(JSON.stringify({ id: 1, result: {} }));

    expect(String(duplicate.protocol.getFailure())).toContain("unknown or duplicate response id");
  });

  it("拒绝早于对应响应的 started 通知", async () => {
    const earlyThread = createProtocolFixture();
    earlyThread.protocol.start();

    await sendMessage(earlyThread, {
      method: "thread/started",
      params: { thread: { id: "thread-1" } },
    });

    expect(String(earlyThread.protocol.getFailure())).toContain(
      "thread/started arrived before thread/start response",
    );

    const earlyTurn = createProtocolFixture();
    await advanceToThreadStarted(earlyTurn);
    await sendMessage(earlyTurn, {
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", status: "inProgress" },
      },
    });

    expect(String(earlyTurn.protocol.getFailure())).toContain(
      "turn/started arrived before turn/start response",
    );
  });

  it("拒绝缺少 turn/started 的 Item 生命周期", async () => {
    const fixture = createProtocolFixture();
    await advanceToTurnResponse(fixture);

    await sendMessage(fixture, createItemStartedMessage());

    expect(String(fixture.protocol.getFailure())).toContain(
      "item/started arrived before the thread/turn lifecycle started",
    );
  });

  it("拒绝重复的 serverRequest/resolved 通知", async () => {
    const fixture = createProtocolFixture();
    await advanceToRunningTurn(fixture);
    await sendMessage(fixture, {
      method: "thread/status/changed",
      params: {
        threadId: "thread-1",
        status: { type: "active", activeFlags: [] },
      },
    });
    await sendMessage(fixture, createItemStartedMessage());
    await sendMessage(fixture, {
      method: "thread/status/changed",
      params: {
        threadId: "thread-1",
        status: { type: "active", activeFlags: ["waitingOnApproval"] },
      },
    });
    await sendMessage(fixture, {
      id: 40,
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        grantRoot: null,
      },
    });

    const resolved = {
      method: "serverRequest/resolved",
      params: { requestId: 40 },
    };
    await sendMessage(fixture, resolved);
    expect(fixture.protocol.getFailure()).toBeNull();

    await sendMessage(fixture, resolved);
    expect(String(fixture.protocol.getFailure())).toContain("serverRequest/resolved was repeated");
  });
});

function createProtocolFixture() {
  const requestTermination = vi.fn();
  const protocol = createCodexAppServerProtocol(
    {
      executable: "C:\\tools\\codex.exe",
      arguments: ["--strict-config", "app-server", "--stdio"],
      prompt: "test prompt",
      model: "test-model",
      modelProvider: "openai",
      cwd: "C:\\worktree",
      runtimeWorkspaceRoots: ["C:\\worktree"],
      allowedPaths: new Map([[TARGET_PATH.toLowerCase(), TARGET_PATH]]),
      environment: { PATH: "C:\\tools" },
      authorizeFileChange: () => ({
        approved: true as const,
        evidence: { source: "unit-test" },
      }),
      timeoutMs: 500,
      outputLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
      terminationConfirmationTimeoutMs: 50,
    },
    {
      send: vi.fn(),
      closeInput: vi.fn(),
      requestTermination,
    },
  );

  return { protocol, requestTermination };
}

/** 协议负例复用的最小测试夹具。 */
type ProtocolFixture = ReturnType<typeof createProtocolFixture>;

async function advanceToThreadStarted(fixture: ProtocolFixture): Promise<void> {
  fixture.protocol.start();
  await sendMessage(fixture, { id: 1, result: {} });
  await sendMessage(fixture, {
    id: 2,
    result: { thread: { id: "thread-1" } },
  });
  await sendMessage(fixture, {
    method: "thread/started",
    params: { thread: { id: "thread-1" } },
  });
}

async function advanceToTurnResponse(fixture: ProtocolFixture): Promise<void> {
  await advanceToThreadStarted(fixture);
  await sendMessage(fixture, {
    id: 3,
    result: { turn: { id: "turn-1", status: "inProgress" } },
  });
}

async function advanceToRunningTurn(fixture: ProtocolFixture): Promise<void> {
  await advanceToTurnResponse(fixture);
  await sendMessage(fixture, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-1", status: "inProgress" },
    },
  });
}

function createItemStartedMessage() {
  return {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "item-1",
        type: "fileChange",
        changes: [
          {
            path: TARGET_PATH,
            kind: { type: "update", move_path: null },
            diff: "sensitive diff",
          },
        ],
        status: "inProgress",
      },
    },
  };
}

async function sendMessage(fixture: ProtocolFixture, message: unknown): Promise<void> {
  await fixture.protocol.handleLine(JSON.stringify(message));
}

function readErrorChain(value: unknown): string {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current = value;

  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    messages.push(current.message);
    current = current.cause;
  }

  return messages.join("\n");
}
