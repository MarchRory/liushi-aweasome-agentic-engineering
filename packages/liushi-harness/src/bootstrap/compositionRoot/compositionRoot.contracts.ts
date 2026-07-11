import type {
  CheckRuntimeHealthUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  ProposeArtifactUseCase,
  RecordApprovalUseCase,
  ResolveRulesUseCase,
  ScanProjectUseCase,
} from "#application/index.js";
import type { Clock, Delay, IdGenerator } from "#common/index.js";

/** Harness 对 CLI 和嵌入式调用方公开的 Use Case 集合。 */
export interface HarnessApplication {
  /** Runtime Store 健康检查。 */
  checkRuntimeHealth: CheckRuntimeHealthUseCase;
  /** Task 创建。 */
  createTask: CreateTaskUseCase;
  /** Task 状态查询。 */
  getTaskStatus: GetTaskStatusUseCase;
  /** Artifact 提交与 Gate 计算。 */
  proposeArtifact: ProposeArtifactUseCase;
  /** Human Approval 记录与 Gate 恢复。 */
  recordApproval: RecordApprovalUseCase;
  /** 确定性 Rule Catalog 解析。 */
  resolveRules: ResolveRulesUseCase;
  /** 显式多仓只读 Project Discovery。 */
  scanProject: ScanProjectUseCase;
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
