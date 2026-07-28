import type { HarnessError, Result } from "#common/index.js";
import type { AgentSessionProcessEvidence } from "#domain/agentSessionProcessEvidence/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { AgentSessionProcessEvidenceCreateDisposition } from "../enums/index.js";

/** 按权威 Workspace 与 Session 定位进程证据。 */
export interface AgentSessionProcessEvidenceLocator {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** Agent Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** create-only 进程证据写入结果。 */
export interface AgentSessionProcessEvidenceCreateResult {
  /** 创建、复用或冲突。 */
  readonly disposition: AgentSessionProcessEvidenceCreateDisposition;
  /** 严格重建后的持久化证据。 */
  readonly evidence: AgentSessionProcessEvidence;
}

/** Agent Session Process Evidence 的不可变持久化端口。 */
export interface AgentSessionProcessEvidenceStore {
  /** 首次创建；相同内容复用，摘要不同冲突。 */
  create(
    evidence: AgentSessionProcessEvidence,
  ): Promise<Result<AgentSessionProcessEvidenceCreateResult, HarnessError>>;
  /** 按 Workspace/Session 加载并严格重建。 */
  load(
    locator: AgentSessionProcessEvidenceLocator,
  ): Promise<Result<AgentSessionProcessEvidence, HarnessError>>;
}
