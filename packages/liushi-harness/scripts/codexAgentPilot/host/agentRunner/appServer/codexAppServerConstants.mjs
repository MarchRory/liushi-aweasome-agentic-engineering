export const CODEX_APP_SERVER_ARGUMENT_TAIL = Object.freeze([
  "--strict-config",
  "app-server",
  "--stdio",
]);

export const CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS = Object.freeze({
  BypassHookTrust: "--dangerously-bypass-hook-trust",
  BypassApprovalsAndSandbox: "--dangerously-bypass-approvals-and-sandbox",
});

export const CODEX_APP_SERVER_METHODS = Object.freeze({
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

export const CODEX_APP_SERVER_REQUEST_IDS = Object.freeze({
  Initialize: 1,
  ThreadStart: 2,
  TurnStart: 3,
});

export const CODEX_APP_SERVER_ITEM_TYPES = Object.freeze({
  AgentMessage: "agentMessage",
  ContextCompaction: "contextCompaction",
  FileChange: "fileChange",
  FileChangeLegacy: "file_change",
  HookPrompt: "hookPrompt",
  Plan: "plan",
  Reasoning: "reasoning",
  UserMessage: "userMessage",
});

export const CODEX_APP_SERVER_CHANGE_KINDS = Object.freeze({
  Update: "update",
});

export const CODEX_APP_SERVER_MOVE_PATH_FIELDS = Object.freeze({
  CamelCase: "movePath",
  SnakeCase: "move_path",
});

export const CODEX_APP_SERVER_GRANT_ROOT_FIELDS = Object.freeze({
  CamelCase: "grantRoot",
  SnakeCase: "grant_root",
});

export const CODEX_APP_SERVER_INPUT_TYPES = Object.freeze({
  Text: "text",
});

export const CODEX_APP_SERVER_APPROVAL_DECISIONS = Object.freeze({
  Accept: "accept",
  Cancel: "cancel",
});

export const CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS = Object.freeze({
  CallbackError: "callback-error",
  InvalidAuthorization: "invalid-authorization",
  InvalidEvidence: "invalid-evidence",
  MissingEvidence: "missing-evidence",
  PolicyDenied: "policy-denied",
  ProposalRejected: "proposal-rejected",
  ProtocolRejected: "protocol-rejected",
});

export const CODEX_APP_SERVER_APPROVAL_POLICY = Object.freeze({
  OnRequest: "on-request",
});

export const CODEX_APP_SERVER_PERMISSIONS = Object.freeze({
  ReadOnly: ":read-only",
});

export const CODEX_APP_SERVER_TURN_STATUSES = Object.freeze({
  Completed: "completed",
  Failed: "failed",
  InProgress: "inProgress",
  Interrupted: "interrupted",
});

export const CODEX_APP_SERVER_ITEM_STATUSES = Object.freeze({
  Completed: "completed",
  Declined: "declined",
  Failed: "failed",
  InProgress: "inProgress",
});

export const CODEX_APP_SERVER_OUTCOMES = Object.freeze({
  Succeeded: "succeeded",
  Failed: "failed",
  Denied: "denied",
  Interrupted: "interrupted",
  OutcomeUnknown: "outcome_unknown",
});

export const CODEX_APP_SERVER_TERMINATION_REASONS = Object.freeze({
  AuthorizationError: "authorization-error",
  InputError: "input-error",
  OutputLimit: "output-limit",
  PolicyDenied: "policy-denied",
  ProcessError: "process-error",
  ProtocolError: "protocol-error",
  StderrLimit: "stderr-limit",
  Timeout: "timeout",
});

export const CODEX_APP_SERVER_PROTOCOL_PHASES = Object.freeze({
  Created: "created",
  InitializePending: "initialize-pending",
  ThreadPending: "thread-pending",
  TurnPending: "turn-pending",
  Running: "running",
  Completed: "completed",
});

export const CODEX_APP_SERVER_DEFAULTS = Object.freeze({
  TimeoutMs: 30_000,
  OutputLimitBytes: 1_024 * 1_024,
  StderrLimitBytes: 64 * 1_024,
  TerminationConfirmationTimeoutMs: 1_000,
});

export const CODEX_APP_SERVER_JSON_RPC_ERRORS = Object.freeze({
  MethodNotFound: -32601,
  InvalidRequest: -32600,
});

export const CODEX_APP_SERVER_REMOTE_CONTROL_STATUS = Object.freeze({
  Disabled: "disabled",
});

export const CODEX_APP_SERVER_THREAD_STATUS = Object.freeze({
  Active: "active",
  Idle: "idle",
});

export const CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS = Object.freeze({
  WaitingOnApproval: "waitingOnApproval",
});

export const CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS = Object.freeze([
  Object.freeze({
    type: CODEX_APP_SERVER_THREAD_STATUS.Active,
    activeFlags: Object.freeze([]),
  }),
  Object.freeze({
    type: CODEX_APP_SERVER_THREAD_STATUS.Active,
    activeFlags: Object.freeze([CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS.WaitingOnApproval]),
  }),
  Object.freeze({
    type: CODEX_APP_SERVER_THREAD_STATUS.Active,
    activeFlags: Object.freeze([]),
  }),
  Object.freeze({
    type: CODEX_APP_SERVER_THREAD_STATUS.Idle,
  }),
]);
