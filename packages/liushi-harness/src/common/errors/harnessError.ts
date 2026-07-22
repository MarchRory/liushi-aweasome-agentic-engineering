/** Harness 可以稳定暴露给 CLI、Adapter 和测试的错误类别。 */
export enum HarnessErrorCode {
  /** 输入缺失、格式非法或包含未支持参数。 */
  InvalidInput = "invalid_input",
  /** 请求的 Task 不存在。 */
  TaskNotFound = "task_not_found",
  /** Workflow 的持久化状态不存在。 */
  WorkflowNotFound = "workflow_not_found",
  /** 相同 Workspace 和 Task ID 已存在。 */
  TaskAlreadyExists = "task_already_exists",
  /** 相同 Workspace 和 Workflow ID 已经存在。 */
  WorkflowAlreadyExists = "workflow_already_exists",
  /** CodingTask 的持久化状态不存在。 */
  CodingTaskNotFound = "coding_task_not_found",
  /** 相同 Workspace 与 CodingTask ID 已经存在。 */
  CodingTaskAlreadyExists = "coding_task_already_exists",
  /** 请求的 EvidenceBundle 不存在。 */
  EvidenceBundleNotFound = "evidence_bundle_not_found",
  /** 同一 Verification Run 已绑定不同 EvidenceBundle。 */
  EvidenceBundleConflict = "evidence_bundle_conflict",
  /** Task 当前状态不允许目标迁移。 */
  InvalidStateTransition = "invalid_state_transition",
  /** 另一个进程或未修复 Lock 阻止当前操作。 */
  LockUnavailable = "lock_unavailable",
  /** Workspace 当前已有活跃 Task，保守的 maxActiveTasks=1 规则阻止继续创建。 */
  WorkspaceBusy = "workspace_busy",
  /** 请求基于的 Event Tail 已过期，必须重新加载后再提交。 */
  VersionConflict = "version_conflict",
  /** Action Journal 已证明动作未应用，修复确定性前置条件后允许创建新命令重试。 */
  PreconditionNotMet = "precondition_not_met",
  /** Hard Invariant 或确定性 Policy 禁止当前动作。 */
  OperationForbidden = "operation_forbidden",
  /** 同一 DecisionRequest 已记录不兼容的 Human 决策。 */
  DecisionConflict = "decision_conflict",
  /** Event、Snapshot、Hash 或 Schema 无法通过完整性校验。 */
  CorruptStore = "corrupt_store",
  /** 文件系统操作失败且没有更具体的稳定错误。 */
  IoFailure = "io_failure",
  /** Event Log 已开始写入但写入或 fsync 失败，持久化结果未知且禁止自动重试。 */
  EventLogCommitOutcomeUnknown = "event_log_commit_outcome_unknown",
  /** 请求的 Action Journal 不存在。 */
  ActionNotFound = "action_not_found",
  /** Action ID、幂等键或 Journal 状态与既有记录冲突。 */
  ActionConflict = "action_conflict",
  /** Action Journal 已开始写入但结果未知，禁止自动重试。 */
  ActionJournalCommitOutcomeUnknown = "action_journal_commit_outcome_unknown",
  /** Action 执行锁释放失败，必须恢复 Lock 后再决定后续动作。 */
  ActionExecutionLockReleaseUnknown = "action_execution_lock_release_unknown",
  /** EvidenceBundle 已开始持久化但提交结果未知，禁止自动重试。 */
  EvidenceBundleCommitOutcomeUnknown = "evidence_bundle_commit_outcome_unknown",
  /** 请求的 Executor Compatibility Evidence 不存在。 */
  ExecutorCompatibilityEvidenceNotFound = "executor_compatibility_evidence_not_found",
  /** 请求的 Executor Compatibility Matrix 不存在。 */
  ExecutorCompatibilityMatrixNotFound = "executor_compatibility_matrix_not_found",
  /** Executor Compatibility 记录已开始写入但提交结果未知，禁止自动重试。 */
  ExecutorCompatibilityCommitOutcomeUnknown = "executor_compatibility_commit_outcome_unknown",
  /** Executor Compatibility 发布文件已开始提交但耐久结果未知，禁止自动重试。 */
  ExecutorCompatibilityPublicationCommitOutcomeUnknown = "executor_compatibility_publication_commit_outcome_unknown",
  /** Release Artifact 发布后的 root 或耐久结果未知，必须停止自动重试。 */
  ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown = "executor_compatibility_release_artifact_commit_outcome_unknown",
  /** Sigstore 无法为已获 G6 批准的 Executor Compatibility 声明生成签名。 */
  ExecutorCompatibilityAttestationSigningFailed = "executor_compatibility_attestation_signing_failed",
  /** Sigstore Bundle、Trusted Root 或发布者身份无法通过关闭式验证。 */
  ExecutorCompatibilityAttestationVerificationFailed = "executor_compatibility_attestation_verification_failed",
  /** Command Handler 已执行但 Receipt 无法可靠落盘，禁止自动重试。 */
  CommandGatewayCommitOutcomeUnknown = "command_gateway_commit_outcome_unknown",
  /** 请求的 Installation Revision 不存在。 */
  InstallationRevisionNotFound = "installation_revision_not_found",
  /** Installation 已出现部分副作用，必须先由恢复流程分类或由 Human 决策。 */
  InstallationRecoveryRequired = "installation_recovery_required",
  /** Installation checkpoint 已开始持久化但提交结果未知，禁止自动重试。 */
  InstallationCommitOutcomeUnknown = "installation_commit_outcome_unknown",
  /** CodingTask Session Activation Record 已发布但父目录耐久性失败，提交结果未知且禁止自动重试。 */
  CodingTaskSessionActivationCommitOutcomeUnknown = "coding_task_session_activation_commit_outcome_unknown",
}

/** Harness 跨层返回的可分类错误。 */
export class HarnessError extends Error {
  /** 稳定错误类别。 */
  public readonly code: HarnessErrorCode;

  /** 支撑诊断但不包含 Secret 的结构化细节。 */
  public readonly details: Readonly<Record<string, string>>;

  public constructor(
    code: HarnessErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "HarnessError";
    this.code = code;
    this.details = details;
  }
}
