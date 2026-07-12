import type { HarnessError, Result } from "#common/index.js";

/** Codex Hook Adapter 返回给平台 Wrapper 的结构化 JSON。 */
export interface CodexHookResponse {
  /** 应直接写到 Codex stdout 的 JSON 对象。 */
  readonly body: Readonly<Record<string, unknown>>;
}

/** 执行器 Adapter 的统一 Hook 调用 Port。 */
export interface CodexHookHandler {
  /** 解析一次 Codex Stdin JSON，并返回平台可消费的响应。 */
  execute(input: unknown): Promise<Result<CodexHookResponse, HarnessError>>;
}
