import type {
  CodexHookHandlerType,
  CodexHookEvent,
  CodexHookMatcher,
  CodexWireApi,
} from "../enums/index.js";

/** 固定生产 Provider 的 Codex 配置对象。 */
export interface CodexModelProviderConfig {
  /** Provider 显示名称。 */
  name: string;
  /** Provider 使用的 wire API。 */
  wire_api: CodexWireApi;
  /** 是否要求 OpenAI 认证。 */
  requires_openai_auth: boolean;
  /** 是否支持 WebSocket。 */
  supports_websockets: boolean;
}

/** Codex 原生 command Hook handler。 */
export interface CodexHookCommandHandler {
  /** handler 类型。 */
  type: CodexHookHandlerType;
  /** POSIX 命令。 */
  command: string;
  /** Windows 命令。 */
  commandWindows: string;
  /** 超时秒数。 */
  timeout: number;
  /** 状态提示。 */
  statusMessage: string;
}

/** Codex 原生 Hook group。 */
export interface CodexHookGroup {
  /** 工具 matcher。 */
  matcher: CodexHookMatcher;
  /** 唯一 command handler。 */
  hooks: readonly [CodexHookCommandHandler];
}

/** 候选 Hook 配置。 */
export interface CodexHookCandidateConfig {
  /** Codex Hook 按事件分组的配置。 */
  hooks: Readonly<Record<CodexHookEvent, readonly [CodexHookGroup]>>;
}

/** Codex Hook Trust 输入。 */
export interface CodexHookTrustInput {
  /** Codex 返回的 Hook key。 */
  key: string;
  /** Codex 返回的当前 sha256 摘要。 */
  currentHash: string;
}

/** 旧 exec 参数兼容输入。 */
export interface CodexAgentArgumentsInput {
  /** Hook 声明 overrides。 */
  hookDeclarationOverrides: readonly string[];
  /** Hook 信任 override。 */
  hookTrustOverride: string;
  /** Agent 工作目录。 */
  worktreeRoot: string;
  /** 兼容的模型参数。 */
  model: string;
  /** 兼容的 sandbox 参数。 */
  sandbox: string;
  /** 兼容的 approval policy。 */
  approvalPolicy: string;
}
