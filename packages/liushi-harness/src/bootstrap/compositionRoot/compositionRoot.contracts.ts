import type {
  ApplicationCommandGateway,
  BindHookWorkspaceUseCase,
  CanonicalHookDispatcher,
  CodexHookHandler,
  CheckRuntimeHealthUseCase,
  CompileProjectProfileUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  GetTaskTimelineUseCase,
  GetActionJournalUseCase,
  ListRecoverableActionsUseCase,
  ListTraceObservationsUseCase,
  ProposeArtifactUseCase,
  ProbeCodexCapabilitiesUseCase,
  RecordApprovalUseCase,
  RecordActionIntentUseCase,
  RecordActionObservationUseCase,
  RecordActionResolutionUseCase,
  RecordTraceObservationUseCase,
  ResolveRulesUseCase,
  ScanProjectUseCase,
  WorkflowCommandService,
} from "#application/index.js";
import type { Clock, Delay, IdGenerator } from "#common/index.js";

/** Harness 对 CLI 和嵌入式调用方公开的 Use Case 集合。 */
export interface HarnessApplication {
  /** 所有版本化写入口复用的持久化 Command Gateway。 */
  applicationCommandGateway: ApplicationCommandGateway;
  /** 规范化 Action Hook 调度器。 */
  handleHook: CanonicalHookDispatcher;
  /** Codex PreToolUse/PostToolUse 平台适配器。 */
  handleCodexHook: CodexHookHandler;
  /** Codex 执行器只读能力探测。 */
  probeCodexCapabilities: ProbeCodexCapabilitiesUseCase;
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
  /** 显式多仓只读 Project Discovery。 */
  scanProject: ScanProjectUseCase;
  /** RequirementWorkflow 的版本化写入入口。 */
  workflowCommands: WorkflowCommandService;
}

/** 创建 Harness Application 的可注入依赖。 */
export interface HarnessApplicationOptions {
  /** Runtime Store 根目录。 */
  storeRoot: string;
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
  /** 可选 DecisionRequest ID Generator。 */
  decisionRequestIdGenerator?: IdGenerator;
  /** 可选 Approval ID Generator。 */
  approvalIdGenerator?: IdGenerator;
}
