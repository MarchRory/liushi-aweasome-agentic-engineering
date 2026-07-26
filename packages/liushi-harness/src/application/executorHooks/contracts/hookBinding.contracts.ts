import type { HOOK_BINDING_SCHEMA_VERSION } from "../constants/index.js";
import type { SESSION_HOOK_BINDING_SCHEMA_VERSION } from "../constants/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

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

/** Session Hook Binding v2 的规范输入，不包含自引用的 Session Binding Digest。 */
export interface SessionHookBindingInput {
  /** 固定为 Session Hook Binding v2 的 Schema 版本。 */
  readonly schemaVersion: typeof SESSION_HOOK_BINDING_SCHEMA_VERSION;
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
  /** 允许 Hook 代表其执行文件动作的 Agent Actor 标识。 */
  readonly actorId: string;
  /** Binding 创建时间。 */
  readonly boundAt: string;
  /** 外部 Agent Session 标识。 */
  readonly sessionId: string;
  /** CodingTask 标识。 */
  readonly codingTaskId: string;
  /** 本次 Session 的正整数 Attempt 编号。 */
  readonly attemptNumber: number;
  /** 受管 Worktree 标识。 */
  readonly worktreeId: string;
  /** 受管 Worktree 根目录 Digest。 */
  readonly worktreeRootDigest: string;
  /** Session Activation Record 的 Binding Digest。 */
  readonly activationBindingDigest: string;
}

/** 完整的 Session Hook Binding v2。 */
export interface SessionHookBinding extends SessionHookBindingInput {
  /** 对除自身外全部规范字段计算的 Digest。 */
  readonly sessionBindingDigest: string;
}

/** Hook Binding Store 对外接受的 v1/v2 Binding 联合类型。 */
export type HookBinding = HookWorkspaceBinding | SessionHookBinding;

/** Session Binding Digest 的最小注入 Port。 */
export interface HookBindingDigestPort {
  /** 对 JSON-compatible 规范字段计算稳定 Content Digest。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}
