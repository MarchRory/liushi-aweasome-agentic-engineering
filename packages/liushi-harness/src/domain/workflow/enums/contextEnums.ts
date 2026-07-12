/** Context 来源的封闭类别。 */
export enum ContextSource {
  /** 正式 Artifact 内容。 */
  Artifact = "artifact",
  /** 已记录的 Evidence 内容。 */
  Evidence = "evidence",
  /** Repository 当前工程内容。 */
  Repository = "repository",
  /** 外部 Wiki 内容。 */
  Wiki = "wiki",
  /** 外部 Ticket 内容。 */
  Ticket = "ticket",
  /** 工具调用产生的输出。 */
  ToolOutput = "tool_output",
  /** 已登记的 Project Memory 内容。 */
  ProjectMemory = "project_memory",
}

/** Context 内容所处的信任通道。 */
export enum TrustChannel {
  /** Harness 管理的 Instruction 通道。 */
  Instruction = "instruction",
  /** Harness 接纳的正式 Artifact 通道。 */
  Artifact = "artifact",
  /** Harness 接纳的 Evidence 通道。 */
  Evidence = "evidence",
  /** 已登记且带来源的 Project Memory 通道。 */
  ProjectMemory = "project_memory",
  /** 不得改变权限、Gate 或输出 Schema 的外部内容通道。 */
  ExternalUntrusted = "external_untrusted",
}
