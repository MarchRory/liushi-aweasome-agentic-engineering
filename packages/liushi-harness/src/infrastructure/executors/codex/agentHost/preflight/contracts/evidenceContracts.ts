import type {
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS,
  CODEX_APP_SERVER_THREAD_STATUS,
} from "../../appServer/enums/index.js";
import type { CodexAppServerThreadStatusTransition } from "../../appServer/contracts/index.js";
import type {
  CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS,
  CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODES,
  CODEX_APP_SERVER_PREFLIGHT_RESULTS,
  CODEX_APP_SERVER_PREFLIGHT_SCENARIOS,
} from "../enums/index.js";

/** 描述 Preflight runner 使用的资源限制。 */
export interface CodexAppServerPreflightRunnerLimits {
  /** 单次运行允许的最长时间（毫秒）。 */
  readonly timeoutMs: number;
  /** 标准输出允许保留的最大字节数。 */
  readonly outputLimitBytes: number;
  /** 标准错误输出允许保留的最大字节数。 */
  readonly stderrLimitBytes: number;
  /** 等待进程终止确认的最长时间（毫秒）。 */
  readonly terminationConfirmationTimeoutMs: number;
}

/** 描述 Responses 传输层的确定性证据。 */
export interface CodexAppServerPreflightTransportEvidence {
  /** Responses 服务提供方标识。 */
  readonly providerId: string;
  /** 是否支持 WebSocket；当前本地服务固定为不支持。 */
  readonly supportsWebsockets: false;
  /** WebSocket 尝试次数；当前本地服务固定为零。 */
  readonly websocketAttempts: 0;
  /** 重连尝试次数；当前本地服务固定为零。 */
  readonly reconnectAttempts: 0;
}

/** 描述单个零模型场景的固定证据结构。 */
export interface CodexAppServerPreflightScenarioEvidence {
  /** 场景标识。 */
  readonly scenario: CODEX_APP_SERVER_PREFLIGHT_SCENARIOS;
  /** 场景执行结果。 */
  readonly result: CODEX_APP_SERVER_PREFLIGHT_RESULTS;
  /** 场景最终结局。 */
  readonly outcome: CODEX_APP_SERVER_OUTCOMES;
  /** 审批请求次数；零模型场景固定为一次。 */
  readonly approvalRequestCount: 1;
  /** 本地模型请求次数；零模型场景固定为一次。 */
  readonly localModelRequestCount: 1;
  /** Responses 请求次数。 */
  readonly responsesRequestCount: number;
  /** 已完成的 Responses 响应次数。 */
  readonly completedResponseCount: number;
  /** 目标文件是否发生变化。 */
  readonly targetChanged: boolean;
  /** 进程是否已退出；验证通过时固定为是。 */
  readonly processExited: true;
  /** 进程是否可能仍在运行；验证通过时固定为否。 */
  readonly processMayBeRunning: false;
  /** Codex 线程状态转换序列。 */
  readonly threadStatusTransitions: readonly CodexAppServerThreadStatusTransition[];
}

/** 描述不含证据摘要字段的 Preflight 证据正文。 */
export interface CodexAppServerPreflightEvidenceBody {
  /** 证据结构版本。 */
  readonly schemaVersion: string;
  /** Codex 可执行文件摘要。 */
  readonly codexExecutableDigest: string;
  /** Codex 版本。 */
  readonly codexVersion: string;
  /** Preflight 执行模式。 */
  readonly executionMode: CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODES;
  /** 合成授权来源；不得解释为 Human Approval。 */
  readonly authorizationOrigin: CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS;
  /** Preflight 启动的进程数量；当前契约固定为两个。 */
  readonly processCount: 2;
  /** 真实模型请求数量；零模型 Preflight 固定为零。 */
  readonly realModelRequests: 0;
  /** runner 资源限制。 */
  readonly runnerLimits: CodexAppServerPreflightRunnerLimits;
  /** Responses 传输证据。 */
  readonly transport: CodexAppServerPreflightTransportEvidence;
  /** 允许更新场景证据。 */
  readonly positive: CodexAppServerPreflightScenarioEvidence;
  /** 显式拒绝更新场景证据。 */
  readonly negative: CodexAppServerPreflightScenarioEvidence;
}

/** 描述正式发布的 App Server Preflight 证据。 */
export interface CodexAppServerPreflightEvidence extends CodexAppServerPreflightEvidenceBody {
  /** 证据正文的摘要。 */
  readonly evidenceDigest: string;
}

/** 描述创建证据时可接受的场景结果输入。 */
export interface CodexAppServerPreflightEvidenceInput {
  /** 绑定证据的 Codex 可执行文件摘要。 */
  readonly codexExecutableDigest: string;
  /** 可选的 Codex 版本。 */
  readonly codexVersion?: string;
  /** 可选的正向场景原始结果。 */
  readonly positive?: unknown;
  /** 可选的负向场景原始结果。 */
  readonly negative?: unknown;
  /** 可选的全部场景原始结果。 */
  readonly scenarioResults?: readonly unknown[];
}

/** 描述校验证据时必须绑定的 Codex 身份。 */
export interface CodexAppServerPreflightEvidenceExpectation {
  /** 期望的 Codex 可执行文件摘要。 */
  readonly codexExecutableDigest: string;
  /** 期望的 Codex 版本。 */
  readonly codexVersion: string;
}

/** 描述线程状态转换的最小校验结构。 */
export type CodexAppServerPreflightThreadTransition = {
  /** 线程状态。 */
  readonly type: CODEX_APP_SERVER_THREAD_STATUS;
  /** 可选的线程活动标志。 */
  readonly activeFlags?: readonly CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS[];
};

/** 暴露场景证据作为 worker 返回结果的公共名称。 */
export type CodexPreflightScenarioResult = CodexAppServerPreflightScenarioEvidence;
