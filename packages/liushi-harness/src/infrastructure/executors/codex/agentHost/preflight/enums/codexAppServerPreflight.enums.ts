import { CODEX_APP_SERVER_OUTCOMES } from "../../appServer/enums/index.js";

/** Codex App Server 零模型 Preflight 场景闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_SCENARIOS {
  /** 允许的目标文件更新。 */
  AllowedUpdate = "allowed_update",
  /** 越出写入集合的更新。 */
  OutOfSetUpdate = "out_of_set_update",
}

/** Preflight 的语义结果闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_RESULTS {
  /** 允许更新后的语义结果。 */
  Accepted = "accepted",
  /** 越界更新被取消后的语义结果。 */
  Cancelled = "cancelled",
}

/** Preflight 采用的执行模式闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODES {
  /** 使用 App Server 文件变更审批，不发起真实模型请求。 */
  AppServerFileChangeApproval = "codex_app_server_file_change_approval.v1",
}

/** Preflight SSE 事件闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_SSE_EVENTS {
  /** 本地 Responses 服务返回工具调用项。 */
  OutputItemDone = "response.output_item.done",
  /** 本地 Responses 服务返回完成事件。 */
  Completed = "response.completed",
}

/** Preflight Evidence 的授权来源闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS {
  /** 仅用于协议验证的合成授权，不代表 Human Approval。 */
  SyntheticPreflight = "synthetic_preflight",
}

/** Responses 请求中受验的输入项类型闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_REQUEST_ITEM_TYPES {
  /** 对话消息。 */
  Message = "message",
}

/** Responses 请求中受验的角色闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_REQUEST_ROLES {
  /** 固定 Preflight Prompt 的用户角色。 */
  User = "user",
}

/** Responses 请求中受验的内容类型闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_REQUEST_CONTENT_TYPES {
  /** 输入文本。 */
  InputText = "input_text",
}

/** Responses 请求中受验的工具选择闭集。 */
export enum CODEX_APP_SERVER_PREFLIGHT_TOOL_CHOICES {
  /** 由模型选择是否调用工具。 */
  Auto = "auto",
}

/** 兼容旧 Pilot 调用方的场景名称。 */
export { CODEX_APP_SERVER_PREFLIGHT_SCENARIOS as CodexPreflightScenario };
/** 兼容旧 Pilot 调用方的语义结果名称。 */
export { CODEX_APP_SERVER_PREFLIGHT_RESULTS as CodexPreflightResult };

/** 仅保留正式 Runner outcome 的兼容别名。 */
export { CODEX_APP_SERVER_OUTCOMES as CODEX_APP_SERVER_PREFLIGHT_RUNNER_OUTCOMES };

Object.freeze(CODEX_APP_SERVER_PREFLIGHT_SCENARIOS);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_RESULTS);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODES);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_SSE_EVENTS);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_REQUEST_ITEM_TYPES);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_REQUEST_ROLES);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_REQUEST_CONTENT_TYPES);
Object.freeze(CODEX_APP_SERVER_PREFLIGHT_TOOL_CHOICES);
