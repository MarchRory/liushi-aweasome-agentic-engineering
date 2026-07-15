import type { InstallationTarget, InstallPlan } from "#domain/installation/index.js";

/** 创建 dry-run InstallPlan 的输入。 */
export interface CreateInstallPlanInput {
  /** 只允许当前切片实现的 Codex 目标。 */
  readonly target: InstallationTarget;
  /** 真实存在且安全的绝对 Repository 根目录。 */
  readonly root: string;
  /** Workspace 外部标识。 */
  readonly workspaceId: string;
  /** Repository 外部标识。 */
  readonly repositoryId: string;
  /** 计划创建 actor。 */
  readonly actorId: string;
}

/** 创建计划的明确副作用边界输出。 */
export interface CreateInstallPlanOutput {
  /** 完整且已持久化的不可变计划。 */
  readonly plan: InstallPlan;
  /** dry-run 固定不触碰 Repository。 */
  readonly repositoryMutated: false;
  /** 计划已写入 Runtime Store。 */
  readonly planPersisted: true;
}
