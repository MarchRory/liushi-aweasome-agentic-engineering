import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { ArtifactDigest, ArtifactId } from "#domain/artifact/index.js";
import type { CodingTaskId } from "#domain/codingTask/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionId } from "../identifiers/index.js";

/** Session Activation 的领域 Digest Port，Application ContentDigestPort 可直接实现此契约。 */
export interface CodingTaskSessionActivationDigestPort {
  /** 对 JSON-compatible 的规范字段计算稳定 Content Digest。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** 不包含 bindingDigest 的 Activation Record 规范字段。 */
export interface CodingTaskSessionActivationRecordInput {
  /** 固定 Schema 版本。 */
  readonly schemaVersion: string;
  /** 外部 Agent Session ID。 */
  readonly sessionId: CodingTaskSessionId;
  /** Harness 工作区 ID。 */
  readonly workspaceId: WorkspaceId;
  /** 编码任务 ID。 */
  readonly codingTaskId: CodingTaskId;
  /** 被外部 Session 激活的源 Task ID。 */
  readonly sourceTaskId: TaskId;
  /** 目标 Repository ID。 */
  readonly repositoryId: RepositoryId;
  /** 本次 Session 绑定的正整数 Attempt。 */
  readonly attemptNumber: number;
  /** Attempt 开始时间，必须是规范 ISO UTC。 */
  readonly attemptStartedAt: string;
  /** 受管 Worktree ID。 */
  readonly worktreeId: string;
  /** 受管 Worktree Root Digest。 */
  readonly worktreeRootDigest: ContentDigest;
  /** 已批准 PlanRisk Artifact ID。 */
  readonly planRiskArtifactId: ArtifactId;
  /** 已批准 PlanRisk Artifact Digest。 */
  readonly planRiskArtifactDigest: ArtifactDigest;
  /** 外部 Agent Actor ID。 */
  readonly agentActorId: string;
  /** Activation 完成时间，必须是规范 ISO UTC。 */
  readonly activatedAt: string;
}

/** 可持久化且不可变的完整 Activation Record。 */
export interface CodingTaskSessionActivationRecord extends CodingTaskSessionActivationRecordInput {
  /** 对完整规范字段计算的 Binding Digest。 */
  readonly bindingDigest: ContentDigest;
}

/** bindingDigest 的完整规范输入。 */
export type CodingTaskSessionActivationBindingDigestInput = CodingTaskSessionActivationRecordInput;
