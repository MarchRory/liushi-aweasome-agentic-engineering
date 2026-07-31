import { describe, expect, it } from "vitest";

import {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_APPROVAL_POLICY,
  CODEX_APP_SERVER_ARGUMENT_TAIL,
  CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS,
  CODEX_APP_SERVER_CHANGE_KINDS,
  CODEX_APP_SERVER_DEFAULTS,
  CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS,
  CODEX_APP_SERVER_GRANT_ROOT_FIELDS,
  CODEX_APP_SERVER_INPUT_TYPES,
  CODEX_APP_SERVER_ITEM_STATUSES,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_JSON_RPC_ERRORS,
  CODEX_APP_SERVER_METHODS,
  CODEX_APP_SERVER_MOVE_PATH_FIELDS,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_PERMISSIONS,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
  CODEX_APP_SERVER_REMOTE_CONTROL_STATUS,
  CODEX_APP_SERVER_REQUEST_IDS,
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
  CODEX_APP_SERVER_TERMINATION_REASONS,
  CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS,
  CODEX_APP_SERVER_THREAD_STATUS,
  CODEX_APP_SERVER_TURN_STATUSES,
  runCodexAgentAppServer,
  runCodexAgentAppServerRunner,
  runCodexAppServer,
} from "../../../src/infrastructure/executors/codex/agentHost/appServer/index.js";

describe("Codex App Server 正式公共契约", () => {
  it("保留固定 Pilot 使用的三个等价 Runner 入口", () => {
    expect(runCodexAppServer).toBe(runCodexAgentAppServer);
    expect(runCodexAgentAppServerRunner).toBe(runCodexAgentAppServer);
  });

  it("保留已验证的启动与协议常量", () => {
    expect(CODEX_APP_SERVER_ARGUMENT_TAIL).toEqual(["--strict-config", "app-server", "--stdio"]);
    expect(CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS).toEqual({
      BypassHookTrust: "--dangerously-bypass-hook-trust",
      BypassApprovalsAndSandbox: "--dangerously-bypass-approvals-and-sandbox",
    });
    expect(CODEX_APP_SERVER_METHODS).toEqual({
      Initialize: "initialize",
      Initialized: "initialized",
      ThreadStart: "thread/start",
      ThreadStarted: "thread/started",
      ThreadStatusChanged: "thread/status/changed",
      TurnStart: "turn/start",
      TurnStarted: "turn/started",
      ItemStarted: "item/started",
      ItemCompleted: "item/completed",
      FileChangeRequestApproval: "item/fileChange/requestApproval",
      FileChangePatchUpdated: "item/fileChange/patchUpdated",
      TurnDiffUpdated: "turn/diff/updated",
      TurnCompleted: "turn/completed",
      ThreadTokenUsageUpdated: "thread/tokenUsage/updated",
      ServerRequestResolved: "serverRequest/resolved",
      AgentMessageDelta: "item/agentMessage/delta",
      PlanDelta: "item/plan/delta",
      ReasoningSummaryTextDelta: "item/reasoningSummaryText/delta",
      ReasoningTextDelta: "item/reasoningText/delta",
      AccountRateLimitsUpdated: "account/rateLimits/updated",
      RemoteControlStatusChanged: "remoteControl/status/changed",
    });
    expect(CODEX_APP_SERVER_REQUEST_IDS).toEqual({
      Initialize: 1,
      ThreadStart: 2,
      TurnStart: 3,
    });
  });

  it("保留受限 File Change 与 Human Approval 值域", () => {
    expect(CODEX_APP_SERVER_ITEM_TYPES).toEqual({
      AgentMessage: "agentMessage",
      ContextCompaction: "contextCompaction",
      FileChange: "fileChange",
      FileChangeLegacy: "file_change",
      HookPrompt: "hookPrompt",
      Plan: "plan",
      Reasoning: "reasoning",
      UserMessage: "userMessage",
    });
    expect(CODEX_APP_SERVER_CHANGE_KINDS).toEqual({ Update: "update" });
    expect(CODEX_APP_SERVER_MOVE_PATH_FIELDS).toEqual({
      CamelCase: "movePath",
      SnakeCase: "move_path",
    });
    expect(CODEX_APP_SERVER_GRANT_ROOT_FIELDS).toEqual({
      CamelCase: "grantRoot",
      SnakeCase: "grant_root",
    });
    expect(CODEX_APP_SERVER_INPUT_TYPES).toEqual({ Text: "text" });
    expect(CODEX_APP_SERVER_APPROVAL_DECISIONS).toEqual({
      Accept: "accept",
      Cancel: "cancel",
    });
    expect(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS).toEqual({
      CallbackError: "callback-error",
      InvalidAuthorization: "invalid-authorization",
      InvalidEvidence: "invalid-evidence",
      MissingEvidence: "missing-evidence",
      PolicyDenied: "policy-denied",
      ProposalRejected: "proposal-rejected",
      ProtocolRejected: "protocol-rejected",
    });
    expect(CODEX_APP_SERVER_APPROVAL_POLICY).toEqual({ OnRequest: "on-request" });
    expect(CODEX_APP_SERVER_PERMISSIONS).toEqual({ ReadOnly: ":read-only" });
  });

  it("保留终态、失败分类和默认限制", () => {
    expect(CODEX_APP_SERVER_TURN_STATUSES).toEqual({
      Completed: "completed",
      Failed: "failed",
      InProgress: "inProgress",
      Interrupted: "interrupted",
    });
    expect(CODEX_APP_SERVER_ITEM_STATUSES).toEqual({
      Completed: "completed",
      Declined: "declined",
      Failed: "failed",
      InProgress: "inProgress",
    });
    expect(CODEX_APP_SERVER_OUTCOMES).toEqual({
      Succeeded: "succeeded",
      Failed: "failed",
      Denied: "denied",
      Interrupted: "interrupted",
      OutcomeUnknown: "outcome_unknown",
    });
    expect(CODEX_APP_SERVER_TERMINATION_REASONS).toEqual({
      AuthorizationError: "authorization-error",
      InputError: "input-error",
      OutputLimit: "output-limit",
      PolicyDenied: "policy-denied",
      ProcessError: "process-error",
      ProtocolError: "protocol-error",
      StderrLimit: "stderr-limit",
      Timeout: "timeout",
    });
    expect(CODEX_APP_SERVER_PROTOCOL_PHASES).toEqual({
      Created: "created",
      InitializePending: "initialize-pending",
      ThreadPending: "thread-pending",
      TurnPending: "turn-pending",
      Running: "running",
      Completed: "completed",
    });
    expect(CODEX_APP_SERVER_DEFAULTS).toEqual({
      TimeoutMs: 30_000,
      OutputLimitBytes: 1_024 * 1_024,
      StderrLimitBytes: 64 * 1_024,
      TerminationConfirmationTimeoutMs: 1_000,
    });
    expect(CODEX_APP_SERVER_JSON_RPC_ERRORS).toEqual({
      MethodNotFound: -32601,
      InvalidRequest: -32600,
    });
  });

  it("保留受限 Thread Status 序列", () => {
    expect(CODEX_APP_SERVER_REMOTE_CONTROL_STATUS).toEqual({ Disabled: "disabled" });
    expect(CODEX_APP_SERVER_THREAD_STATUS).toEqual({
      Active: "active",
      Idle: "idle",
    });
    expect(CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS).toEqual({
      WaitingOnApproval: "waitingOnApproval",
    });
    expect(CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS).toEqual([
      { type: "active", activeFlags: [] },
      { type: "active", activeFlags: ["waitingOnApproval"] },
      { type: "active", activeFlags: [] },
      { type: "idle" },
    ]);
    expect(Object.isFrozen(CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS)).toBe(true);
    expect(
      CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.every((transition) =>
        Object.isFrozen(transition),
      ),
    ).toBe(true);
  });
});
