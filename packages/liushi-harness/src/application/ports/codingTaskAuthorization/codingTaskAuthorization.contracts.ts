import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskExecutionAuthorization } from "#domain/codingTask/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

/** CodingTask 创建时请求校验的上游授权上下文。 */
export interface CodingTaskAuthorizationRequest {
  /** RequirementWorkflow Task 的稳定标识。 */
  sourceTaskId: TaskId;
  /** 当前 Workspace 的稳定标识。 */
  workspaceId: WorkspaceId;
  /** 当前 CodingTask 绑定的 Repository。 */
  repositoryId: RepositoryId;
  /** 当前 CodingTask 请求写入的规范路径集合。 */
  writeSet: readonly string[];
  /** 调用方声明的授权引用，只用于定位和比对，不是授权事实。 */
  requested: CodingTaskExecutionAuthorization;
}

/** 从权威 RequirementWorkflow Replay 派生 CodingTask 执行授权。 */
export interface CodingTaskExecutionAuthorizationResolver {
  /** 返回由上游 Artifact 和 Human Approval 重算的不可变授权。 */
  resolve(
    request: CodingTaskAuthorizationRequest,
  ): Promise<Result<CodingTaskExecutionAuthorization, HarnessError>>;
}
