/** Codex App Server 可接受的启动绕过参数名称。 */
export enum CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS {
  /** 绕过 Hook 信任检查的参数。 */
  BypassHookTrust = "--dangerously-bypass-hook-trust",
  /** 绕过审批和沙箱检查的参数。 */
  BypassApprovalsAndSandbox = "--dangerously-bypass-approvals-and-sandbox",
}

/** Codex App Server 的 JSON-RPC 方法集合。 */
export enum CODEX_APP_SERVER_METHODS {
  /** 初始化客户端能力。 */
  Initialize = "initialize",
  /** 初始化完成通知。 */
  Initialized = "initialized",
  /** 创建线程请求。 */
  ThreadStart = "thread/start",
  /** 线程创建通知。 */
  ThreadStarted = "thread/started",
  /** 线程状态变化通知。 */
  ThreadStatusChanged = "thread/status/changed",
  /** 创建 Turn 请求。 */
  TurnStart = "turn/start",
  /** Turn 创建通知。 */
  TurnStarted = "turn/started",
  /** Item 开始通知。 */
  ItemStarted = "item/started",
  /** Item 完成通知。 */
  ItemCompleted = "item/completed",
  /** 文件变更审批请求。 */
  FileChangeRequestApproval = "item/fileChange/requestApproval",
  /** 文件变更补丁更新通知。 */
  FileChangePatchUpdated = "item/fileChange/patchUpdated",
  /** Turn 差异更新通知。 */
  TurnDiffUpdated = "turn/diff/updated",
  /** Turn 完成通知。 */
  TurnCompleted = "turn/completed",
  /** 线程 Token 用量更新通知。 */
  ThreadTokenUsageUpdated = "thread/tokenUsage/updated",
  /** 服务端请求完成通知。 */
  ServerRequestResolved = "serverRequest/resolved",
  /** Agent 消息增量通知。 */
  AgentMessageDelta = "item/agentMessage/delta",
  /** 计划增量通知。 */
  PlanDelta = "item/plan/delta",
  /** 推理摘要增量通知。 */
  ReasoningSummaryTextDelta = "item/reasoningSummaryText/delta",
  /** 推理正文增量通知。 */
  ReasoningTextDelta = "item/reasoningText/delta",
  /** 账户速率限制更新通知。 */
  AccountRateLimitsUpdated = "account/rateLimits/updated",
  /** 远程控制状态更新通知。 */
  RemoteControlStatusChanged = "remoteControl/status/changed",
}

/** Codex App Server 内置请求编号。 */
export enum CODEX_APP_SERVER_REQUEST_IDS {
  /** 初始化请求编号。 */
  Initialize = 1,
  /** 创建线程请求编号。 */
  ThreadStart = 2,
  /** 创建 Turn 请求编号。 */
  TurnStart = 3,
}

/** Codex App Server 允许消费的 Item 类型。 */
export enum CODEX_APP_SERVER_ITEM_TYPES {
  /** Agent 消息 Item。 */
  AgentMessage = "agentMessage",
  /** 上下文压缩 Item。 */
  ContextCompaction = "contextCompaction",
  /** 文件变更 Item。 */
  FileChange = "fileChange",
  /** 旧版本文件变更 Item。 */
  FileChangeLegacy = "file_change",
  /** Hook Prompt 项目 Item。 */
  HookPrompt = "hookPrompt",
  /** 计划 Item。 */
  Plan = "plan",
  /** 推理 Item。 */
  Reasoning = "reasoning",
  /** 用户消息 Item。 */
  UserMessage = "userMessage",
}

/** Codex App Server 支持的文件变更种类。 */
export enum CODEX_APP_SERVER_CHANGE_KINDS {
  /** 覆盖更新既有文件。 */
  Update = "update",
}

/** Codex App Server 移动路径字段名称。 */
export enum CODEX_APP_SERVER_MOVE_PATH_FIELDS {
  /** 驼峰移动路径字段。 */
  CamelCase = "movePath",
  /** 下划线移动路径字段。 */
  SnakeCase = "move_path",
}

/** Codex App Server 授权根字段名称。 */
export enum CODEX_APP_SERVER_GRANT_ROOT_FIELDS {
  /** 驼峰授权根字段。 */
  CamelCase = "grantRoot",
  /** 下划线授权根字段。 */
  SnakeCase = "grant_root",
}

/** Codex App Server 用户输入种类。 */
export enum CODEX_APP_SERVER_INPUT_TYPES {
  /** 纯文本输入。 */
  Text = "text",
}

/** Codex App Server 文件审批决策。 */
export enum CODEX_APP_SERVER_APPROVAL_DECISIONS {
  /** 接受本次文件变更。 */
  Accept = "accept",
  /** 取消本次文件变更。 */
  Cancel = "cancel",
}

/** Codex App Server 授权审计原因。 */
export enum CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS {
  /** 授权回调抛出错误。 */
  CallbackError = "callback-error",
  /** 授权结果结构无效。 */
  InvalidAuthorization = "invalid-authorization",
  /** 授权证据不是规范 JSON。 */
  InvalidEvidence = "invalid-evidence",
  /** 批准结果缺少证据。 */
  MissingEvidence = "missing-evidence",
  /** 上层策略拒绝。 */
  PolicyDenied = "policy-denied",
  /** 文件变更提案被拒绝。 */
  ProposalRejected = "proposal-rejected",
  /** 协议拒绝了审批请求。 */
  ProtocolRejected = "protocol-rejected",
}

/** Codex App Server 审批策略。 */
export enum CODEX_APP_SERVER_APPROVAL_POLICY {
  /** 每次请求都通过客户端审批。 */
  OnRequest = "on-request",
}

/** Codex App Server 权限配置。 */
export enum CODEX_APP_SERVER_PERMISSIONS {
  /** 仅允许读取。 */
  ReadOnly = ":read-only",
}

/** JSON-RPC 错误码集合。 */
export enum CODEX_APP_SERVER_JSON_RPC_ERRORS {
  /** 方法不存在。 */
  MethodNotFound = -32601,
  /** 请求无效。 */
  InvalidRequest = -32600,
}

/** Codex App Server 远程控制状态。 */
export enum CODEX_APP_SERVER_REMOTE_CONTROL_STATUS {
  /** 远程控制被禁用。 */
  Disabled = "disabled",
}

Reflect.deleteProperty(CODEX_APP_SERVER_REQUEST_IDS, "1");
Reflect.deleteProperty(CODEX_APP_SERVER_REQUEST_IDS, "2");
Reflect.deleteProperty(CODEX_APP_SERVER_REQUEST_IDS, "3");
Reflect.deleteProperty(CODEX_APP_SERVER_JSON_RPC_ERRORS, "-32601");
Reflect.deleteProperty(CODEX_APP_SERVER_JSON_RPC_ERRORS, "-32600");

Object.freeze(CODEX_APP_SERVER_FORBIDDEN_ARGUMENTS);
Object.freeze(CODEX_APP_SERVER_METHODS);
Object.freeze(CODEX_APP_SERVER_REQUEST_IDS);
Object.freeze(CODEX_APP_SERVER_ITEM_TYPES);
Object.freeze(CODEX_APP_SERVER_CHANGE_KINDS);
Object.freeze(CODEX_APP_SERVER_MOVE_PATH_FIELDS);
Object.freeze(CODEX_APP_SERVER_GRANT_ROOT_FIELDS);
Object.freeze(CODEX_APP_SERVER_INPUT_TYPES);
Object.freeze(CODEX_APP_SERVER_APPROVAL_DECISIONS);
Object.freeze(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS);
Object.freeze(CODEX_APP_SERVER_APPROVAL_POLICY);
Object.freeze(CODEX_APP_SERVER_PERMISSIONS);
Object.freeze(CODEX_APP_SERVER_JSON_RPC_ERRORS);
Object.freeze(CODEX_APP_SERVER_REMOTE_CONTROL_STATUS);
