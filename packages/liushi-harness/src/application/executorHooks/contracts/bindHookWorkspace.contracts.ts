/** 绑定 Codex Hook 工作区所需的外部输入。 */
export interface BindHookWorkspaceInput {
  /** 仓库或公共层的绝对根目录。 */
  readonly workspaceRoot: string;
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** 要进入 Implementation 的 Task 标识。 */
  readonly taskId: string;
  /** Human 已确认的 PlanRisk Artifact 标识。 */
  readonly planRiskArtifactId: string;
  /** Human 已确认的 PlanRisk Artifact Digest。 */
  readonly planRiskArtifactDigest: string;
  /** 允许 Hook 代表其执行文件动作的 Agent Actor 标识。 */
  readonly actorId: string;
}
