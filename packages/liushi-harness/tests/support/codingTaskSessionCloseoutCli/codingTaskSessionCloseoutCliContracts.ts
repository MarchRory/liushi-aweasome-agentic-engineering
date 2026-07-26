import type {
  CodingTaskExecutionAuthorization,
  createHarnessApplication,
} from "../../../src/index.js";
import type { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";

/** Closeout CLI 真实 Git E2E 的完整运行夹具。 */
export interface CodingTaskSessionCloseoutCliSetup {
  /** 通过生产 Composition Root 创建的准备阶段 Application。 */
  readonly application: ReturnType<typeof createHarnessApplication>;
  /** 临时 Runtime Store 根目录。 */
  readonly storeRoot: string;
  /** 真实 Git Repository 根目录。 */
  readonly repositoryRoot: string;
  /** Activation 创建的受管 Worktree 根目录。 */
  readonly worktreeRoot: string;
  /** Closeout Command Envelope 输入文件。 */
  readonly closeoutCommandFile: string;
  /** Closeout Process State 的权威持久化文件。 */
  readonly closeoutStateFile: string;
  /** Closeout 命令的严格 JSON 对象。 */
  readonly closeoutCommand: Record<string, unknown>;
  /** Closeout 需要验证的基础 Revision。 */
  readonly baseRevision: string;
  /** 业务 Workspace 标识。 */
  readonly workspaceId: string;
  /** 目标 Repository 标识。 */
  readonly repositoryId: string;
  /** Session 标识。 */
  readonly sessionId: string;
  /** Agent Actor 标识。 */
  readonly agentActorId: string;
  /** Closeout 关键持久化证据文件。 */
  readonly evidenceFiles: readonly string[];
  /** Approved PlanRisk 绑定，供 Manifest 构造使用。 */
  readonly executionAuthorization: CodingTaskExecutionAuthorization;
}

/** 一次 runCli 调用的可审计输出。 */
export interface CodingTaskSessionCloseoutCliRun {
  /** CLI 退出码。 */
  readonly exitCode: number;
  /** 标准输出片段。 */
  readonly stdout: readonly string[];
  /** 标准错误片段。 */
  readonly stderr: readonly string[];
}

/** 负向 E2E 可覆盖的 CLI 运行时声明。 */
export interface CodingTaskSessionCloseoutCliRunOverrides {
  /** 覆盖 Repository 标识。 */
  readonly repositoryId?: string;
  /** 覆盖 Repository 绝对根目录。 */
  readonly repositoryRoot?: string;
  /** 覆盖 Agent Actor 标识。 */
  readonly agentActorId?: string;
  /** 覆盖 Closeout Command 文件。 */
  readonly closeoutCommandFile?: string;
}

/** Closeout JSON 输出 Envelope 的最小稳定投影。 */
export interface CodingTaskSessionCloseoutCliEnvelope {
  /** CLI 输出 Schema 版本。 */
  readonly schemaVersion: string;
  /** CLI 结果状态。 */
  readonly status: CliResponseStatus;
  /** CLI 命令标识。 */
  readonly command: CliCommand;
  /** Closeout State 投影。 */
  readonly data: Record<string, unknown>;
}

/** 关键持久化证据的原始字节快照。 */
export type CodingTaskSessionCloseoutEvidenceBytes = Readonly<Record<string, string>>;
