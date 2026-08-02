import type {
  ApplicationCommandGateway,
  ApplyInstallPlanUseCase,
  AssemblePrReadyArtifactUseCase,
  ChangeSetCheckpointPort,
  CodingTaskCellService,
  ActivateCodingTaskSessionService,
  CodingTaskCellRuntimeBinding,
  CodingTaskCommandService,
  CodingTaskSessionRuntimeBinding,
  BindHookWorkspaceUseCase,
  CanonicalHookDispatcher,
  CodexHookHandler,
  CheckRuntimeHealthUseCase,
  CompileCodexExecutorCompatibilityUseCase,
  CreateExecutorCompatibilityPublicationBundleUseCase,
  PublishExecutorCompatibilityPublicationBundleUseCase,
  VerifyExecutorCompatibilityReleaseAttestationUseCase,
  VerifyExecutorCompatibilityReleaseManifestUseCase,
  CompileProjectProfileUseCase,
  ConfirmRequirementUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  GetTaskTimelineUseCase,
  GetActionJournalUseCase,
  InspectWorktreeUseCase,
  InspectGitChangeSetUseCase,
  CodingTaskSessionCloseoutManager,
  CodingTaskSessionCloseoutRecoveryCommandService,
  CodingTaskSessionDeliverySubmissionService,
  CodingTaskDeliveryCompletionService,
  CodingTaskSessionEffectiveCloseoutResolver,
  AssessCodingTaskSessionCloseoutRecoveryUseCase,
  RunVerificationUseCase,
  RunAndPersistVerificationUseCase,
  VerificationCommandService,
  ImplementationCommandService,
  ImplementationSubmissionService,
  AcquireRepositoryLockUseCase,
  JournaledActionRunner,
  ListRecoverableActionsUseCase,
  ListTraceObservationsUseCase,
  ProposeArtifactUseCase,
  ProbeCodexCapabilitiesUseCase,
  QueryExecutorCompatibilityUseCase,
  CreateInstallPlanUseCase,
  RecordApprovalUseCase,
  RecordActionIntentUseCase,
  RecordActionObservationUseCase,
  RecordActionResolutionUseCase,
  RecordTraceObservationUseCase,
  ResolveRulesUseCase,
  SelectVerificationPlanUseCase,
  ScanProjectUseCase,
  WorkflowCommandService,
  WorktreeProvisionCommandService,
  AssessWorktreeProvisionRecoveryUseCase,
  WorktreeProvisionRecoveryCommandService,
  RecordAgentSessionProcessEvidenceService,
  PilotMetricsService,
  AnalyzeRequirementUseCase,
} from "#application/index.js";
import type {
  CodingTaskExecutionAuthorizationResolver,
  EvidenceBundleStore,
  RepositoryRootResolverPort,
  VerificationExecutorPort,
  ExecutorCompatibilityAttestationVerifierPort,
  RequirementAnalysisAgent,
} from "#application/ports/index.js";
import type { Clock, Delay, IdGenerator } from "#common/index.js";

import type { VerificationExecutionMode } from "./enums/index.js";

/** Harness 对 CLI 和嵌入式调用方公开的 Use Case 集合。 */
export interface HarnessApplication {
  /** 所有版本化写入口复用的持久化 Command Gateway。 */
  applicationCommandGateway: ApplicationCommandGateway;
  /** Verification 结果的强一致不可变 Store。 */
  evidenceBundleStore: EvidenceBundleStore;
  /** 按稳定身份解析启动期可信 Repository Root 的边界。 */
  repositoryRootResolver: RepositoryRootResolverPort;
  /** 规范化 Action Hook 调度器。 */
  handleHook: CanonicalHookDispatcher;
  /** Codex PreToolUse/PostToolUse 平台适配器。 */
  handleCodexHook: CodexHookHandler;
  /** Codex 执行器只读能力探测。 */
  probeCodexCapabilities: ProbeCodexCapabilitiesUseCase;
  /** 编译并持久化 Codex Executor Compatibility Matrix。 */
  compileCodexExecutorCompatibility: CompileCodexExecutorCompatibilityUseCase;
  /** 按 Matrix Digest 读取并重新证明 Executor Compatibility。 */
  queryExecutorCompatibility: QueryExecutorCompatibilityUseCase;
  /** 从精确 Matrix Digest 创建无副作用的 Publication Bundle。 */
  createExecutorCompatibilityPublicationBundle: CreateExecutorCompatibilityPublicationBundleUseCase;
  /** 从精确 Matrix Digest 创建并原子发布不可变 Publication Bundle。 */
  publishExecutorCompatibilityPublicationBundle: PublishExecutorCompatibilityPublicationBundleUseCase;
  /** 使用显式 Trusted Root 离线验证完整签名 Artifact。 */
  verifyExecutorCompatibilityReleaseAttestation: VerifyExecutorCompatibilityReleaseAttestationUseCase;
  /** 使用 Trust Profile 与显式 Trusted Root 离线验证完整 Manifest 发布链。 */
  verifyExecutorCompatibilityReleaseManifest: VerifyExecutorCompatibilityReleaseManifestUseCase;
  /** 生成并持久化不修改 Repository 的 G0 Managed Files InstallPlan。 */
  createInstallPlan: CreateInstallPlanUseCase;
  /** 应用 Human 精确批准的 G0 Managed Files InstallPlan。 */
  applyInstallPlan: ApplyInstallPlanUseCase;
  /** 将人工确认的 Task/PlanRisk 绑定到执行器工作区。 */
  bindHookWorkspace: BindHookWorkspaceUseCase;
  /** Runtime Store 健康检查。 */
  checkRuntimeHealth: CheckRuntimeHealthUseCase;
  /** 将已获 G8 批准的 ProjectProfileProposal 编译为 Profile Bundle。 */
  compileProjectProfile: CompileProjectProfileUseCase;
  /** Task 创建。 */
  createTask: CreateTaskUseCase;
  /** Task 状态查询。 */
  getTaskStatus: GetTaskStatusUseCase;
  /** Tracker 使用的只读 Task Timeline Projection。 */
  getTaskTimeline: GetTaskTimelineUseCase;
  /** 重放一个 Action Journal。 */
  getActionJournal: GetActionJournalUseCase;
  /** 查询 Task 中全部非终态 Action。 */
  listRecoverableActions: ListRecoverableActionsUseCase;
  /** 为 Tracker 查询可丢失 Trace Observation。 */
  listTraceObservations: ListTraceObservationsUseCase;
  /** Artifact 提交与 Gate 计算。 */
  proposeArtifact: ProposeArtifactUseCase;
  /** Human Approval 记录与 Gate 恢复。 */
  recordApproval: RecordApprovalUseCase;
  /** Action Intent 记录。 */
  recordActionIntent: RecordActionIntentUseCase;
  /** Action Observation 记录。 */
  recordActionObservation: RecordActionObservationUseCase;
  /** Action Resolution 记录。 */
  recordActionResolution: RecordActionResolutionUseCase;
  /** Best-effort Trace Observation 记录。 */
  recordTraceObservation: RecordTraceObservationUseCase;
  /** 确定性 Rule Catalog 解析。 */
  resolveRules: ResolveRulesUseCase;
  /** 从已批准 Profile、实现结果与 Rule Bundle 生成 Verification Plan。 */
  selectVerificationPlan: SelectVerificationPlanUseCase;
  /** 显式多仓只读 Project Discovery。 */
  scanProject: ScanProjectUseCase;
  /** 只读生成待 Human 审阅的 Requirement Contract Proposal。 */
  analyzeRequirement: AnalyzeRequirementUseCase;
  /** Human Review 后确认并持久化 Requirement 与 G1 Approval。 */
  confirmRequirement: ConfirmRequirementUseCase;
  /** RequirementWorkflow 的版本化写入入口。 */
  workflowCommands: WorkflowCommandService;
  /** CodingTask 的版本化写入入口。 */
  codingTaskCommands: CodingTaskCommandService;
  /** 运行受信宿主预编译的兼容 Cell；不受信 Agent 应使用 Session Delivery Completion。 */
  runCodingTaskCell: CodingTaskCellService;
  /** 激活真实外部 Agent 的 CodingTask Session。 */
  activateCodingTaskSession: ActivateCodingTaskSessionService;
  /** 由受信宿主在真实 Agent 进程结束后记录不可变进程证据。 */
  recordAgentSessionProcessEvidence: RecordAgentSessionProcessEvidenceService;
  /** 预登记并结算真实 Pilot 原始事实。 */
  pilotMetrics: PilotMetricsService;
  /** 供受信宿主从权威状态组装 PR-ready Artifact 的低层能力。 */
  assemblePrReadyArtifact: AssemblePrReadyArtifactUseCase;
  /** 只读检查 CodingTask 工作树、基线和 Write Set。 */
  inspectWorktree: InspectWorktreeUseCase;
  /** 从受管 Worktree 生成提交前权威 ChangeSet Snapshot。 */
  inspectGitChangeSet: InspectGitChangeSetUseCase;
  /** 创建或恢复与提交前 ChangeSet 双向绑定的 Git Checkpoint。 */
  changeSetCheckpoints: ChangeSetCheckpointPort;
  /** 可恢复地关闭 CodingTask Session，并严格停止在 CheckpointBound。 */
  closeoutCodingTaskSession: CodingTaskSessionCloseoutManager;
  /** 只读评估 Closeout Recovery 当前唯一可行 Resolution。 */
  assessCodingTaskSessionCloseoutRecovery: AssessCodingTaskSessionCloseoutRecoveryUseCase;
  /** 通过统一命令网关执行经 Human Gate 批准的 Closeout Recovery。 */
  recoverCodingTaskSessionCloseout: CodingTaskSessionCloseoutRecoveryCommandService;
  /** 解析原始 Closeout 与 Recovery 后的最终有效 Checkpoint。 */
  resolveCodingTaskSessionEffectiveCloseout: CodingTaskSessionEffectiveCloseoutResolver;
  /** 将 Effective Closeout 接纳为 CodingTask ImplementationSubmitted Event。 */
  submitCodingTaskSessionDelivery: CodingTaskSessionDeliverySubmissionService;
  /** 从 Session Delivery 连续执行权威验证并装配 PR-ready Artifact。 */
  completeCodingTaskSessionDelivery: CodingTaskDeliveryCompletionService;
  /** 执行验证计划并生成不携带原始输出的 EvidenceBundle。 */
  runVerification: RunVerificationUseCase;
  /** 执行 Verification 并强一致提交 EvidenceBundle。 */
  runAndPersistVerification: RunAndPersistVerificationUseCase;
  /** 供受信宿主运行已物化 Verification Plan 的低层版本化入口。 */
  verificationCommands: VerificationCommandService;
  /** 在 Write Set、仓库锁和 Journal 边界内应用文件变更。 */
  implementationCommands: ImplementationCommandService;
  /** 创建实现 Git Checkpoint 并原子收口当前 Attempt。 */
  implementationSubmissions: ImplementationSubmissionService;
  /** 获取 Repository 级排他 Lock；不执行 Worktree 创建或代码写入。 */
  acquireRepositoryLock: AcquireRepositoryLockUseCase;
  /** 以 Action 执行锁和持久化 Journal 闭合副作用。 */
  journaledActionRunner: JournaledActionRunner;
  /** 创建并验证 Managed Worktree 的版本化命令入口。 */
  worktreeProvisionCommands: WorktreeProvisionCommandService;
  /** 只读评估未知 Worktree Provision Action 的真实现场。 */
  assessWorktreeProvisionRecovery: AssessWorktreeProvisionRecoveryUseCase;
  /** 由 Human 绑定评估摘要后闭合未知 Worktree Provision Action。 */
  worktreeProvisionRecoveryCommands: WorktreeProvisionRecoveryCommandService;
}

/** 创建 Harness Application 的可注入依赖。 */
export interface HarnessApplicationOptions {
  /** Runtime Store 根目录。 */
  storeRoot: string;
  /** 可选包版本测试覆盖；生产 Bootstrap 从 package.json 注入。 */
  packageVersion?: string;
  /** 可选测试 Clock。 */
  clock?: Clock;
  /** 可选并发协调 Delay。 */
  delay?: Delay;
  /** 可选 Task ID Generator。 */
  taskIdGenerator?: IdGenerator;
  /** 可选 Event ID Generator。 */
  eventIdGenerator?: IdGenerator;
  /** 可选 Artifact ID Generator。 */
  artifactIdGenerator?: IdGenerator;
  /** 可选 InstallPlan ID Generator。 */
  installPlanIdGenerator?: IdGenerator;
  /** 可选 Installation Revision ID Generator。 */
  installationRevisionIdGenerator?: IdGenerator;
  /** 可选 DecisionRequest ID Generator。 */
  decisionRequestIdGenerator?: IdGenerator;
  /** 可选 Approval ID Generator。 */
  approvalIdGenerator?: IdGenerator;
  /** 可替换的 CodingTask 权威授权解析器，默认从 Task Replay 派生。 */
  codingTaskAuthorizationResolver?: CodingTaskExecutionAuthorizationResolver;
  /** 可注入的 Verification Executor，默认使用 fail-closed Mock。 */
  verificationExecutor?: VerificationExecutorPort;
  /** 未注入 Executor 时使用的验证模式；默认 fail-closed Mock。 */
  verificationExecutionMode?: VerificationExecutionMode;
  /** 可注入的 Repository Lock ID Generator。 */
  repositoryLockIdGenerator?: IdGenerator;
  /** 可注入的可信 Repository Root Resolver；默认使用无绑定的 fail-closed 静态实现。 */
  repositoryRootResolver?: RepositoryRootResolverPort;
  /** 可选 Cell 启动期可信运行时绑定；嵌入式调用未提供时保持兼容。 */
  codingTaskCellRuntimeBinding?: CodingTaskCellRuntimeBinding;
  /** 可选 Session 启动期单仓与 Agent 审计声明；生产宿主负责认证。 */
  codingTaskSessionRuntimeBinding?: CodingTaskSessionRuntimeBinding;
  /** 可替换的离线 Attestation Verifier；默认禁止 TUF 和网络。 */
  executorCompatibilityAttestationVerifier?: ExecutorCompatibilityAttestationVerifierPort;
  /** 可注入的只读 Requirement 分析 Agent；未配置时保持关闭。 */
  requirementAnalysisAgent?: RequirementAnalysisAgent;
}
