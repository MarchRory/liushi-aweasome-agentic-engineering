import type {
  CodexAppServerRunnerOverrides,
  CodexAppServerRunnerResult,
} from "../../appServer/contracts/index.js";
import type {
  CodexAppServerPreflightEvidence,
  CodexAppServerPreflightEvidenceInput,
} from "./evidenceContracts.js";
import type {
  CodexPreflightResponsesServerHandle,
  CodexPreflightResponsesServerInput,
  CodexPreflightScenarioWorkspace,
  CodexPreflightScenarioWorkspaceInput,
  CodexPreflightTemporaryRootDescriptor,
} from "./workspaceContracts.js";

/** 描述允许 worker 注入的 Preflight 环境来源。 */
export interface CodexAppServerPreflightEnvironmentInput {
  /** 可选的来源环境变量集合。 */
  readonly sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  /** Codex home 目录。 */
  readonly codexHome: string;
  /** SQLite home 目录。 */
  readonly sqliteHome: string;
  /** profile home 目录。 */
  readonly profileHome: string;
  /** 临时 home 目录。 */
  readonly tempHome: string;
}

/** 描述执行零模型 Preflight 所需的 Codex 身份与隔离环境来源。 */
export interface CodexAppServerPreflightInput {
  /** 可选的 Codex 可执行文件路径别名。 */
  readonly executable?: string;
  /** 可选的 Codex 可执行文件路径。 */
  readonly codexExecutable?: string;
  /** Codex 可执行文件摘要。 */
  readonly codexExecutableDigest: string;
  /** Codex 版本。 */
  readonly codexVersion: string;
  /** 要使用的模型名称。 */
  readonly model: string;
  /** 可选的来源环境变量集合。 */
  readonly sourceEnvironment?: Readonly<Record<string, string | undefined>>;
}

/** 描述已完成运行时校验的 Preflight 配置。 */
export interface CodexAppServerPreflightConfig {
  /** 最终解析出的 Codex 可执行文件路径。 */
  readonly executable: string;
  /** Codex 可执行文件摘要。 */
  readonly codexExecutableDigest: string;
  /** Codex 版本。 */
  readonly codexVersion: string;
  /** 要使用的模型名称。 */
  readonly model: string;
  /** 可选的来源环境变量集合。 */
  readonly sourceEnvironment?: Readonly<Record<string, string | undefined>>;
}

/** 描述 Probe 可替换的依赖，仅用于确定性测试和受控宿主适配。 */
export interface CodexAppServerPreflightOverrides {
  /** 受信任的临时目录父路径。 */
  readonly trustedTempParent?: string;
  /** 创建正式证据的替代实现。 */
  readonly createEvidence?: (
    input: CodexAppServerPreflightEvidenceInput,
  ) => CodexAppServerPreflightEvidence;
  /** 创建本地 Responses 服务的替代实现。 */
  readonly createResponsesServer?: (
    input: CodexPreflightResponsesServerInput,
  ) => Promise<CodexPreflightResponsesServerHandle>;
  /** 关闭本地 Responses 服务的替代实现。 */
  readonly closeResponsesServer?: (
    server: CodexPreflightResponsesServerHandle,
  ) => Promise<{ readonly confirmed: true }>;
  /** 创建临时根目录的替代实现。 */
  readonly createTemporaryRoot?: (
    trustedTempParent?: string,
  ) => Promise<CodexPreflightTemporaryRootDescriptor>;
  /** 清理临时根目录的替代实现。 */
  readonly cleanupTemporaryRoot?: (
    descriptor: CodexPreflightTemporaryRootDescriptor,
    trustedTempParent?: string,
  ) => Promise<{ readonly confirmed: true }>;
  /** 创建场景工作区的替代实现。 */
  readonly createScenarioWorkspace?: (
    input: CodexPreflightScenarioWorkspaceInput,
    trustedTempParent?: string,
  ) => Promise<CodexPreflightScenarioWorkspace>;
  /** 校验场景工作区的替代实现。 */
  readonly verifyScenarioWorkspace?: (
    workspace: CodexPreflightScenarioWorkspace,
    trustedTempParent?: string,
  ) => Promise<{ readonly targetChanged: boolean }>;
  /** 运行 Codex Agent App Server 的替代实现。 */
  readonly runCodexAgentAppServer?: (
    input: unknown,
    overrides?: CodexAppServerRunnerOverrides,
  ) => Promise<CodexAppServerRunnerResult>;
  /** 传递给 runner 的覆盖项。 */
  readonly runnerOverrides?: CodexAppServerRunnerOverrides;
}
