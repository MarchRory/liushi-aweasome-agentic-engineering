import type { HarnessError, Result } from "#common/index.js";

import type {
  HookBinding,
  HookWorkspaceBinding,
  SessionHookBinding,
} from "#application/executorHooks/index.js";

/** 精确读取 Session Hook Binding v2 的查询键。 */
export interface SessionHookBindingQuery {
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** 外部 Agent Session 标识。 */
  readonly sessionId: string;
}

/** Runtime Store 中保存 Codex 工作区上下文绑定的 Port。 */
export interface HookBindingStore {
  /** 新建一个工作区绑定；同一根目录的不同身份必须冲突。 */
  bind(binding: HookWorkspaceBinding): Promise<Result<HookWorkspaceBinding, HarnessError>>;
  /** 新建一个 Session 级 v2 绑定，并校验其完整摘要。 */
  bind(binding: SessionHookBinding): Promise<Result<SessionHookBinding, HarnessError>>;
  /** 根据当前 Hook cwd 找到最长匹配的工作区绑定。 */
  find(cwd: string): Promise<Result<HookBinding, HarnessError>>;
  /** 精确读取 v2 Session 绑定；不会回退到 v1。 */
  findSession(query: SessionHookBindingQuery): Promise<Result<SessionHookBinding, HarnessError>>;
}

/** Hook Binding Store 实现可以返回的完整 v1/v2 记录类型。 */
export type HookBindingStoreValue = HookBinding;
