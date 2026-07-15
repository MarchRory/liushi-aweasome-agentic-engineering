import type { HarnessError, Result } from "#common/index.js";
import type { InstallPlan, InstallPlanId } from "#domain/installation/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** InstallPlan 运行时不可变持久化边界。 */
export interface InstallPlanStore {
  /** 确认 Runtime Store 与 Repository 不存在相等、祖先或后代关系。 */
  validateRepositoryIsolation(repositoryRoot: string): Promise<Result<void, HarnessError>>;
  /** 保存计划；相同内容幂等成功，不同内容固定为 VersionConflict。 */
  save(plan: InstallPlan): Promise<Result<InstallPlan, HarnessError>>;
  /** 按受限 Workspace 与 Plan ID 严格加载计划。 */
  load(workspaceId: WorkspaceId, planId: InstallPlanId): Promise<Result<InstallPlan, HarnessError>>;
}
