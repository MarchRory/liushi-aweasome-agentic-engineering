import type { HOOK_BINDING_SCHEMA_VERSION } from "../constants/index.js";

/** 一个由 Human 或 Workflow 显式绑定的 Codex Hook 工作区上下文。 */
export interface HookWorkspaceBinding {
  /** Binding 文件的 Schema 版本。 */
  readonly schemaVersion: typeof HOOK_BINDING_SCHEMA_VERSION;
  /** Codex Hook cwd 必须位于其下的仓库根目录。 */
  readonly workspaceRoot: string;
  /** Harness Workspace 标识。 */
  readonly workspaceId: string;
  /** 绑定的唯一 Task 标识。 */
  readonly taskId: string;
  /** 绑定的精确 PlanRisk Artifact 标识。 */
  readonly planRiskArtifactId: string;
  /** 绑定的精确 PlanRisk Artifact Digest。 */
  readonly planRiskArtifactDigest: string;
  /** 产生文件动作的 Agent Actor 标识。 */
  readonly actorId: string;
  /** Binding 创建时间。 */
  readonly boundAt: string;
}
