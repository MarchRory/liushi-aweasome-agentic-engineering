import { describe, expect, it, vi } from "vitest";

import { calculateDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";
import { createAgentFileChangeEvidenceSession } from "../../../scripts/codexAgentPilot/service/agentRun/evidence/index.mjs";

const proposal = Object.freeze({
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-1",
  changes: Object.freeze([{ path: "C:\\pilot\\test\\utils.test.ts", kind: "update" }]),
  grantRoot: null,
});

describe("Codex Agent FileChange Session Evidence", () => {
  it("把 App Server proposal 投影为 Pre/Post Hook 并记录进程证据", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ status: "success", value: {} })
      .mockResolvedValueOnce({
        status: "success",
        value: { body: { hookSpecificOutput: { additionalContext: "recorded" } } },
      });
    const recordProcess = vi.fn(async () => ({ status: "success", value: { reused: false } }));
    const session = await createSession({ execute, recordProcess });

    await session.recordPreAction(proposal);
    await session.recordPostAction({
      runnerResult: createRunnerResult(),
      startedAt: "2026-07-29T00:00:00.000Z",
      completedAt: "2026-07-29T00:00:01.000Z",
    });

    expect(execute).toHaveBeenCalledTimes(2);
    const pre = execute.mock.calls[0][0];
    const post = execute.mock.calls[1][0];
    expect(pre).toMatchObject({
      session_id: "thread-1",
      turn_id: "turn-1",
      tool_use_id: "item-1",
      hook_event_name: "PreToolUse",
      tool_name: "apply_patch",
      tool_input: {
        projection: "codex_app_server_file_change_approval.v1",
        appServerProposal: proposal,
      },
    });
    expect(pre.tool_input.command).toContain("*** Update File: test/utils.test.ts");
    expect(post).toMatchObject({
      ...pre,
      hook_event_name: "PostToolUse",
      tool_response: {
        success: true,
        status: "completed",
        authorizationEvidenceDigest: `sha256:${"a".repeat(64)}`,
        changeDigest: "b".repeat(64),
      },
    });
    expect(recordProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace",
        sessionId: "session-1",
        claimedExecutorSessionIdDigest: calculateDigest("thread-1"),
        executorId: "openai-codex",
        hostSurface: "automation",
        durationMs: 1000,
        outcome: "completed",
        exitCode: 0,
        timedOut: false,
      }),
    );
  });

  it("没有 PreAction 时拒绝 PostAction", async () => {
    const session = await createSession();

    await expect(
      session.recordPostAction({
        runnerResult: createRunnerResult(),
        startedAt: "2026-07-29T00:00:00.000Z",
        completedAt: "2026-07-29T00:00:01.000Z",
      }),
    ).rejects.toThrow("PreAction");
  });

  it("App Server 成功事实不完整时不写 PostAction", async () => {
    const execute = vi.fn(async () => ({ status: "success", value: {} }));
    const recordProcess = vi.fn();
    const session = await createSession({ execute, recordProcess });
    await session.recordPreAction(proposal);

    await expect(
      session.recordPostAction({
        runnerResult: createRunnerResult({ approvedCount: 0 }),
        startedAt: "2026-07-29T00:00:00.000Z",
        completedAt: "2026-07-29T00:00:01.000Z",
      }),
    ).rejects.toThrow("成功事实不足");
    expect(execute).toHaveBeenCalledOnce();
    expect(recordProcess).not.toHaveBeenCalled();
  });
});

async function createSession(overrides = {}) {
  const execute = overrides.execute ?? vi.fn(async () => ({ status: "success", value: {} }));
  const recordProcess =
    overrides.recordProcess ?? vi.fn(async () => ({ status: "success", value: { reused: false } }));
  return createAgentFileChangeEvidenceSession(createInput(), {
    createApplication: async () => ({
      handleCodexHook: { execute },
      recordAgentSessionProcessEvidence: { execute: recordProcess },
    }),
  });
}

function createInput() {
  return {
    paths: {
      consumerRoot: "C:\\consumer",
      runtimeRoot: "C:\\runtime",
      repositoryRoot: "C:\\repository",
    },
    artifacts: { worktreeRoot: "C:\\pilot" },
    approvedState: {
      task: { workspaceId: "workspace" },
      fixedProject: { repositoryId: "repository" },
      actor: { agentActorId: "agent:pilot" },
      activation: { manifest: { sessionId: "session-1" } },
      identities: {
        codex: {
          version: "codex-cli 0.145.0",
          digest: `sha256:${"c".repeat(64)}`,
        },
      },
    },
    packet: {
      model: { id: "gpt-5.6-sol", reasoningEffort: "medium" },
      actionControl: { permissionProfile: ":read-only" },
      prompt: { digest: `sha256:${"d".repeat(64)}` },
      compatibilityArtifacts: { candidateHooksDigest: `sha256:${"e".repeat(64)}` },
    },
  };
}

function createRunnerResult(overrides = {}) {
  return {
    outcome: "succeeded",
    process: {
      processStarted: true,
      processMayBeRunning: false,
      exitCode: 0,
      signal: null,
      timedOut: false,
    },
    protocolEvidence: {
      threadId: "thread-1",
      turnId: "turn-1",
      eventCount: 1,
      responseCount: 3,
      requestCount: 1,
      notificationCount: 0,
      methodCounts: {},
      unknownMethodCount: 0,
      itemCount: 1,
      fileChangeItemCount: 1,
      completedFileChangeCount: 1,
      approvedCount: overrides.approvedCount ?? 1,
      cancelledCount: 0,
      changeDigest: "b".repeat(64),
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
          evidenceDigest: `sha256:${"a".repeat(64)}`,
        },
      ],
    },
  };
}
