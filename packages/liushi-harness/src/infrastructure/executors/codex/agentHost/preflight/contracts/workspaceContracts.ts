import type { CodexPreflightScenario } from "../enums/index.js";

/** 描述受控临时根目录。 */
export interface CodexAppServerPreflightRootDescriptor {
  /** 根目录描述的版本。 */
  readonly schemaVersion: string;
  /** 临时根目录路径。 */
  readonly root: string;
  /** 用于确认所有权的令牌。 */
  readonly ownerToken: string;
}

/** 兼容旧 Pilot 调用方的根目录描述名称。 */
export type CodexPreflightRootDescriptor = CodexAppServerPreflightRootDescriptor;

/** 暴露 workspace worker 使用的临时根目录描述名称。 */
export type CodexPreflightTemporaryRootDescriptor = CodexAppServerPreflightRootDescriptor;

/** 描述创建场景根目录所需的输入。 */
export interface CodexAppServerPreflightRootInput {
  /** 要创建或校验的根目录路径。 */
  readonly root: string;
  /** 用于确认根目录所有权的令牌。 */
  readonly ownerToken: string;
}

/** 描述单个场景工作区的公共结构。 */
export interface CodexPreflightScenarioWorkspace {
  /** 创建该工作区时使用的临时根目录描述。 */
  readonly descriptor: CodexPreflightTemporaryRootDescriptor;
  /** 工作区对应的 Preflight 场景。 */
  readonly scenario: CodexPreflightScenario;
  /** 工作区根目录。 */
  readonly root: string;
  /** Git worktree 根目录。 */
  readonly worktreeRoot: string;
  /** Codex home 目录。 */
  readonly codexHome: string;
  /** SQLite home 目录。 */
  readonly sqliteHome: string;
  /** profile home 目录。 */
  readonly profileHome: string;
  /** 临时 home 目录。 */
  readonly tempHome: string;
  /** 场景允许写入的目标路径。 */
  readonly targetPath: string;
  /** 相对正向目标集越界、仅为触发合成拒绝回调而临时准入的路径。 */
  readonly outOfSetPath: string;
}

/** 描述创建场景工作区所需的根目录与场景输入。 */
export interface CodexPreflightScenarioWorkspaceInput {
  /** 场景使用的临时根目录描述。 */
  readonly descriptor: CodexPreflightTemporaryRootDescriptor;
  /** 要创建的 Preflight 场景。 */
  readonly scenario: CodexPreflightScenario;
}

/** 描述创建本地 Responses 服务所需的固定场景与补丁。 */
export interface CodexPreflightResponsesServerInput {
  /** Responses 服务模拟的 Preflight 场景。 */
  readonly scenario: CodexPreflightScenario;
  /** 注入本地服务的响应补丁。 */
  readonly patch: string;
  /** 请求体必须精确绑定的模型名称。 */
  readonly model: string;
}

/** 描述本地 Responses 服务产生的脱敏计数证据。 */
export interface CodexPreflightResponsesServerEvidence {
  /** 本地模型请求次数。 */
  readonly localModelRequestCount: number;
  /** 收到的请求总数。 */
  readonly requestCount: number;
  /** 已完成的响应次数。 */
  readonly completedResponseCount: number;
}

/** 描述供编排层使用的最小本地 Responses 服务句柄。 */
export interface CodexPreflightResponsesServerHandle {
  /** 本地 Responses 服务基础 URL。 */
  readonly baseUrl: string;
  /** 读取当前服务证据计数。 */
  readonly getEvidence: () => CodexPreflightResponsesServerEvidence;
  /** 关闭服务并确认关闭结果。 */
  readonly close: () => Promise<{ readonly confirmed: true }>;
}
