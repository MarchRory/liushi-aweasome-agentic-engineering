/** Evidence 可以引用的封闭来源类别。 */
export enum EvidenceKind {
  /** 工作区内的文件内容或文件元数据。 */
  File = "file",
  /** Git 提交、分支、差异或状态输出。 */
  Git = "git",
  /** 已执行命令的输入、输出或退出状态。 */
  Command = "command",
  /** 自动化或人工测试产生的结果。 */
  Test = "test",
  /** Wiki、设计文档或知识库页面。 */
  Wiki = "wiki",
  /** 外部工单、Issue 或需求系统条目。 */
  Ticket = "ticket",
  /** 可识别人工参与者给出的说明或确认。 */
  Human = "human",
}

/** Claim 对事实性的自我分类。 */
export enum ClaimClassification {
  /** 可由证据直接支撑的事实。 */
  Fact = "fact",
  /** 基于事实推导但仍需要解释链路的判断。 */
  Inference = "inference",
  /** 当前尚未确认或无法分类的信息。 */
  Unknown = "unknown",
}
