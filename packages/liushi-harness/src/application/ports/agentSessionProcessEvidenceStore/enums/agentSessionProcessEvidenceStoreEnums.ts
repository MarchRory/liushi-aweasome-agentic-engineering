/** 进程证据 create-only 写入结果。 */
export enum AgentSessionProcessEvidenceCreateDisposition {
  /** 首次创建成功。 */
  Created = "created",
  /** 相同语义证据已存在。 */
  Reused = "reused",
  /** 同一 Session 已有不同语义证据。 */
  Conflict = "conflict",
}
