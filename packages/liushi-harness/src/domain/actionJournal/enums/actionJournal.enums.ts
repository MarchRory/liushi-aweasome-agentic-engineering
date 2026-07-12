/** Harness 需要审计的封闭副作用类别。 */
export enum ActionKind {
  /** 写入、移动或删除文件。 */
  FileMutation = "file_mutation",
  /** 修改 Git Worktree、Index、Branch 或 Tag。 */
  GitMutation = "git_mutation",
  /** 执行可能改变环境的本地命令。 */
  CommandExecution = "command_execution",
  /** 通过通用 Connector 修改外部系统。 */
  ConnectorWrite = "connector_write",
  /** 写入企业或项目 Wiki。 */
  WikiWrite = "wiki_write",
  /** 修改 Ticket、Issue 或需求系统。 */
  TicketWrite = "ticket_write",
  /** 创建或修改 Pull Request。 */
  PullRequestWrite = "pull_request_write",
}

/** Action Journal append-only Record 的封闭类别。 */
export enum ActionJournalRecordType {
  /** 执行副作用前记录的 Intent。 */
  Intent = "action_intent",
  /** 执行或恢复检查后记录的 Observation。 */
  Observation = "action_observation",
  /** 对最新 Observation 作出的处置。 */
  Resolution = "action_resolution",
}

/** Action 执行后可被证据支持的封闭结果。 */
export enum ActionOutcome {
  /** 目标后置条件已经满足。 */
  Succeeded = "succeeded",
  /** Action 失败且无法证明完全未产生副作用。 */
  Failed = "failed",
  /** 证据明确证明副作用没有发生。 */
  NotApplied = "not_applied",
  /** 当前证据无法判断副作用是否发生。 */
  OutcomeUnknown = "outcome_unknown",
}

/** Action Observation 之后允许记录的封闭处置。 */
export enum ActionResolution {
  /** 正常执行已满足后置条件并完成提交。 */
  Committed = "committed",
  /** 恢复检查证明既有副作用已经满足后置条件。 */
  Recovered = "recovered",
  /** 证据证明未产生副作用，允许使用同一幂等键重试。 */
  RetryPermitted = "retry_permitted",
  /** 结果失败或未知，必须等待 Human 处理。 */
  HumanRequired = "human_required",
}

/** Action Journal 聚合后的当前状态。 */
export enum ActionJournalStatus {
  /** Intent 已持久化，允许开始一次执行或恢复检查。 */
  IntentRecorded = "intent_recorded",
  /** 已记录 Observation，必须先完成处置。 */
  AwaitingResolution = "awaiting_resolution",
  /** 已证明未执行，可以使用相同幂等键再次尝试。 */
  RetryPermitted = "retry_permitted",
  /** 结果失败或未知，等待 Human 或恢复检查。 */
  WaitingHuman = "waiting_human",
  /** Action 已正常提交。 */
  Committed = "committed",
  /** Action 已通过恢复检查确认完成。 */
  Recovered = "recovered",
}
