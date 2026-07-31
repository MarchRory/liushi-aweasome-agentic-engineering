import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { setImmediate } from "node:timers";

import { describe, expect, it, vi } from "vitest";

import {
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_TERMINATION_REASONS,
  type CodexAppServerConfig,
  type CodexAppServerProcessInfo,
  type CodexAppServerProtocol,
  type CodexAppServerProtocolEvidence,
  runCodexAppServerProcess,
} from "../../../src/infrastructure/executors/codex/agentHost/appServer/index.js";

describe("Codex App Server 进程初始化失败边界", () => {
  it("兼容直接注入已经创建的协议实例", async () => {
    const child = createFakeChild();
    const evidence = createEmptyEvidence();
    const start = vi.fn(() => {
      setImmediate(() => {
        setProcessExitCode(child, 0);
        child.emit("close", 0, null);
      });
    });
    const protocol = createSuccessfulProtocol(evidence, start);

    const result = await runCodexAppServerProcess(createConfig(), protocol, {
      spawnProcess: () => child,
      terminateProcessTree: vi.fn(),
    });

    expect(start).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome: CODEX_APP_SERVER_OUTCOMES.Succeeded,
      process: {
        processStarted: true,
        processMayBeRunning: false,
        outcomeUnknown: false,
      },
      protocolEvidence: evidence,
    });
  });

  it("协议工厂构造失败后确认终止进程树再返回错误", async () => {
    const child = createFakeChild();
    const terminateProcessTree = vi.fn(() => Promise.resolve());

    const error = await runCodexAppServerProcess(
      createConfig(),
      () => {
        throw new Error("protocol construction failed");
      },
      {
        spawnProcess: () => child,
        terminateProcessTree,
      },
    ).catch((cause: unknown) => cause);

    expect(terminateProcessTree).toHaveBeenCalledOnce();
    expect(error).toMatchObject({
      message: "codex app-server protocol could not start",
      processStarted: true,
      processMayBeRunning: false,
      outcomeUnknown: false,
      terminationReason: CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError,
    });
  });

  it("协议构造失败且无法确认终止时返回 outcomeUnknown", async () => {
    const child = createFakeChild();
    const terminateProcessTree = vi.fn(() =>
      Promise.reject(new Error("termination could not be confirmed")),
    );

    const error = await runCodexAppServerProcess(
      createConfig(),
      () => {
        throw new Error("protocol construction failed");
      },
      {
        spawnProcess: () => child,
        terminateProcessTree,
      },
    ).catch((cause: unknown) => cause);

    expect(terminateProcessTree).toHaveBeenCalledOnce();
    expect(error).toMatchObject({
      message: "codex app-server process tree termination is unconfirmed",
      processStarted: true,
      processMayBeRunning: true,
      outcomeUnknown: true,
      terminationReason: CODEX_APP_SERVER_TERMINATION_REASONS.ProcessError,
    });
  });
});

function createSuccessfulProtocol(
  evidence: CodexAppServerProtocolEvidence,
  start: () => void,
): CodexAppServerProtocol {
  const protocol: CodexAppServerProtocol = {
    start,
    handleLine: vi.fn(() => Promise.resolve()),
    fail: vi.fn(),
    abort: vi.fn(),
    finalize: vi.fn((process: CodexAppServerProcessInfo) => ({
      outcome: CODEX_APP_SERVER_OUTCOMES.Succeeded,
      process,
      protocolEvidence: evidence,
    })),
    getEvidence: () => evidence,
    getFailure: () => null,
    getOutcome: () => CODEX_APP_SERVER_OUTCOMES.Succeeded,
    getPolicyDenied: () => false,
  };
  return protocol;
}

function createConfig(): CodexAppServerConfig {
  return {
    executable: "C:\\tools\\codex.exe",
    arguments: ["--strict-config", "app-server", "--stdio"],
    prompt: "test prompt",
    model: "test-model",
    modelProvider: "openai",
    cwd: "C:\\worktree",
    runtimeWorkspaceRoots: ["C:\\worktree"],
    allowedPaths: new Map(),
    environment: { PATH: "C:\\tools" },
    authorizeFileChange: () => ({
      approved: true,
      evidence: { source: "unit-test" },
    }),
    timeoutMs: 500,
    outputLimitBytes: 1_024,
    stderrLimitBytes: 1_024,
    terminationConfirmationTimeoutMs: 50,
  };
}

function createFakeChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(child, {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid: 12345,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => true),
  });
  return child;
}

function setProcessExitCode(child: ChildProcessWithoutNullStreams, exitCode: number): void {
  Object.defineProperty(child, "exitCode", {
    configurable: true,
    enumerable: true,
    value: exitCode,
    writable: true,
  });
}

function createEmptyEvidence(): CodexAppServerProtocolEvidence {
  return {
    threadId: "thread-1",
    turnId: "turn-1",
    eventCount: 0,
    responseCount: 0,
    requestCount: 0,
    notificationCount: 0,
    methodCounts: {},
    unknownMethodCount: 0,
    unknownMethods: [],
    itemCount: 0,
    fileChangeItemCount: 0,
    completedFileChangeCount: 0,
    approvedCount: 0,
    cancelledCount: 0,
    authorizations: [],
    threadStatusTransitions: [],
    changeDigest: "0".repeat(64),
  };
}
