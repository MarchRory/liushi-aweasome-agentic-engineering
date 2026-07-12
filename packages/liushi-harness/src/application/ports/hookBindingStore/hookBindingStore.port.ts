import type { HarnessError, Result } from "#common/index.js";

import type { HookWorkspaceBinding } from "#application/executorHooks/index.js";

/** Runtime Store 中保存 Codex 工作区上下文绑定的 Port。 */
export interface HookBindingStore {
  /** 新建一个工作区绑定；同一根目录的不同身份必须冲突。 */
  bind(binding: HookWorkspaceBinding): Promise<Result<HookWorkspaceBinding, HarnessError>>;
  /** 根据当前 Hook cwd 找到最长匹配的工作区绑定。 */
  find(cwd: string): Promise<Result<HookWorkspaceBinding, HarnessError>>;
}
