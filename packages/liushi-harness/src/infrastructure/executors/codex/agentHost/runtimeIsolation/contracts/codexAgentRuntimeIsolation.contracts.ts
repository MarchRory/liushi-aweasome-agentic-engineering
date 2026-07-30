import type { CodexAgentCredentialStrategy } from "../enums/index.js";

/** 创建 Codex Agent Runtime 计划所需的输入。 */
export interface CodexAgentRuntimePlanInput {
  /** 宿主 Codex Home 的绝对路径。 */
  readonly codexHomeSource: string;
  /** 当前任务的安全单路径标识。 */
  readonly taskId: string;
  /** 使用小写十六进制表示的 SHA-256 源状态摘要。 */
  readonly sourceStateDigest: string;
}

/** Codex Agent Runtime 隔离计划。 */
export interface CodexAgentRuntimePlan extends CodexAgentRuntimePlanInput {
  /** 精确的隔离 Runtime 根目录。 */
  readonly root: string;
  /** 隔离 Codex Home。 */
  readonly codexHome: string;
  /** 隔离 SQLite Home。 */
  readonly sqliteHome: string;
  /** 隔离临时目录。 */
  readonly tempHome: string;
  /** 隔离用户 Home。 */
  readonly profileHome: string;
  /** 源 auth.json 路径。 */
  readonly authSourceFile: string;
  /** 隔离 auth.json 路径。 */
  readonly authFile: string;
  /** 凭据隔离策略。 */
  readonly credentialStrategy: CodexAgentCredentialStrategy;
}

/** 文件系统元数据的最小只读形状。 */
export interface RuntimeFileMetadata {
  /** 文件系统设备标识。 */
  readonly dev: string | number;
  /** 文件系统节点标识。 */
  readonly ino: string | number;
  /** 文件大小，单位为字节。 */
  readonly size: number;
  /** 最后修改时间，单位为毫秒。 */
  readonly mtimeMs: number;
  /** 元数据最后变更时间，单位为毫秒。 */
  readonly ctimeMs: number;
  /** 判断节点是否为普通文件。 */
  isFile(): boolean;
  /** 判断节点是否为目录。 */
  isDirectory(): boolean;
  /** 判断节点是否为符号链接或 junction。 */
  isSymbolicLink(): boolean;
}

/** 创建 Runtime 目录时使用的选项。 */
export interface RuntimeDirectoryCreationOptions {
  /** 新目录的权限模式。 */
  readonly mode: number;
}

/** 删除 Runtime 目录树时使用的选项。 */
export interface RuntimeRemovalOptions {
  /** 是否递归删除目录树。 */
  readonly recursive: boolean;
  /** 是否忽略目标不存在。 */
  readonly force: boolean;
}

/** Runtime 隔离使用的可注入文件系统操作。 */
export interface RuntimeFileSystem {
  /** 修改路径权限。 */
  chmod(path: string, mode: number): Promise<void>;
  /** 以指定复制标志复制文件。 */
  copyFile(source: string, destination: string, mode: number): Promise<void>;
  /** 读取路径自身的元数据。 */
  lstat(path: string): Promise<RuntimeFileMetadata>;
  /** 创建单个目录。 */
  mkdir(path: string, options: RuntimeDirectoryCreationOptions): Promise<void>;
  /** 解析路径的规范绝对形式。 */
  realpath(path: string): Promise<string>;
  /** 读取目录中的直接子项名称。 */
  readdir(path: string): Promise<string[]>;
  /** 删除目录树。 */
  rm(path: string, options: RuntimeRemovalOptions): Promise<void>;
  /** 删除空目录。 */
  rmdir(path: string): Promise<void>;
  /** 读取解引用后的路径元数据。 */
  stat(path: string): Promise<RuntimeFileMetadata>;
}

/** auth.json 元数据校验所需的文件系统操作。 */
export interface RuntimeAuthFileSystem {
  /** 读取路径自身的元数据。 */
  lstat(path: string): Promise<RuntimeFileMetadata>;
  /** 解析路径的规范绝对形式。 */
  realpath(path: string): Promise<string>;
  /** 读取解引用后的路径元数据。 */
  stat(path: string): Promise<RuntimeFileMetadata>;
}

/** Runtime 清理所需的文件系统操作。 */
export interface RuntimeCleanupFileSystem {
  /** 读取路径自身的元数据。 */
  lstat(path: string): Promise<RuntimeFileMetadata>;
  /** 读取目录中的直接子项名称。 */
  readdir(path: string): Promise<string[]>;
  /** 解析路径的规范绝对形式。 */
  realpath(path: string): Promise<string>;
  /** 删除目录树。 */
  rm(path: string, options: RuntimeRemovalOptions): Promise<void>;
  /** 删除空目录。 */
  rmdir(path: string): Promise<void>;
}

/** 成功完成的外部进程结果。 */
export interface RuntimeProcessResult {
  /** 标准输出。 */
  readonly stdout: string;
  /** 标准错误；兼容旧执行器时可以省略。 */
  readonly stderr?: string;
  /** 退出码；兼容会在失败时直接抛错的旧执行器时可以省略。 */
  readonly exitCode?: number;
}

/**
 * Runtime 外部进程执行器。
 *
 * 执行失败、启动失败或非零退出时必须拒绝 Promise 或抛出异常；
 * 兼容旧执行器时可以直接返回标准输出字符串。
 */
export type RuntimeProcessRunner = (
  command: string,
  args: readonly string[],
) => RuntimeProcessResult | string | Promise<RuntimeProcessResult | string>;

/** auth.json 的元数据快照，不包含文件内容。 */
export interface CodexAgentAuthSourceSnapshot {
  /** 被快照文件的绝对路径。 */
  readonly path: string;
  /** 被快照文件的大小。 */
  readonly size: number;
  /** 被快照文件的设备标识。 */
  readonly device: string;
  /** 被快照文件的节点标识。 */
  readonly inode: string;
  /** 被快照文件的最后修改时间。 */
  readonly modifiedAtMs: number;
  /** 被快照文件的元数据最后变更时间。 */
  readonly changedAtMs: number;
}

/** auth.json 元数据完整性验证结果。 */
export interface CodexAgentAuthVerificationResult {
  /** 是否通过完整性验证。 */
  readonly verified: true;
}

/** Windows Runtime 目录加固结果。 */
export interface WindowsRuntimeSecurityResult {
  /** 用于设置 ACL 的唯一当前用户 SID。 */
  readonly sid: string;
}

/** 已创建 Runtime 的结果。 */
export interface PreparedCodexAgentRuntime {
  /** 经重新校验的 Runtime 计划。 */
  readonly plan: CodexAgentRuntimePlan;
  /** 供隔离 Codex 进程使用的完整环境。 */
  readonly env: Readonly<Record<string, string>>;
  /** 准备阶段捕获的源凭据元数据快照。 */
  readonly credentialSourceSnapshot: CodexAgentAuthSourceSnapshot;
}

/** Runtime 清理结果。 */
export interface RemovedCodexAgentRuntime {
  /** 经重新校验的 Runtime 计划。 */
  readonly plan: CodexAgentRuntimePlan;
  /** 本次是否实际删除了 Runtime 根目录。 */
  readonly removed: boolean;
}

/** Runtime 隔离适配器的可选依赖注入。 */
export interface CodexAgentRuntimeIsolationOverrides extends Partial<RuntimeFileSystem> {
  /** 优先使用的文件系统操作集合。 */
  readonly fs?: Partial<RuntimeFileSystem>;
  /** 用于选择平台安全策略的平台标识。 */
  readonly platform?: string;
  /** 首选宿主环境变量来源。 */
  readonly sourceEnv?: Readonly<Record<string, string | undefined>>;
  /** 兼容旧调用方的宿主环境变量来源别名。 */
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** 兼容旧调用方的宿主环境变量来源短别名。 */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** 首选外部进程执行器。 */
  readonly runProcess?: RuntimeProcessRunner;
  /** 兼容旧调用方的外部进程执行器别名。 */
  readonly processRunner?: RuntimeProcessRunner;
  /** 兼容旧覆盖形状的占位项；生产实现不会读取凭据内容。 */
  readonly readFile?: unknown;
}

/** auth.json 元数据完整性操作的可选依赖注入。 */
export interface CodexAgentAuthIntegrityOverrides extends Partial<RuntimeAuthFileSystem> {
  /** 优先使用的文件系统操作集合。 */
  readonly fs?: Partial<RuntimeAuthFileSystem>;
}

/** Runtime 清理操作的可选依赖注入。 */
export interface CodexAgentRuntimeCleanupOverrides extends Partial<RuntimeCleanupFileSystem> {
  /** 优先使用的文件系统操作集合。 */
  readonly fs?: Partial<RuntimeCleanupFileSystem>;
}

/** POSIX Runtime 目录加固的可选依赖注入。 */
export interface PosixRuntimeSecurityOverrides {
  /** 权限修改操作。 */
  readonly chmod?: RuntimeFileSystem["chmod"];
}

/** Windows Runtime 目录加固的可选依赖注入。 */
export interface WindowsRuntimeSecurityOverrides {
  /** 必须在命令失败时抛错或拒绝的进程执行器。 */
  readonly runProcess?: RuntimeProcessRunner;
}

/** 跨平台 Runtime 目录加固的可选依赖注入。 */
export interface CodexAgentRuntimeSecurityOverrides
  extends PosixRuntimeSecurityOverrides, WindowsRuntimeSecurityOverrides {
  /** 用于选择安全策略的平台标识。 */
  readonly platform?: string;
}

/** 外部 Agent 配置安全检查输入。 */
export interface ExternalAgentSecurityInput {
  /** 宿主用户目录的绝对路径。 */
  readonly hostHome: string;
  /** Agent 工作树根目录的绝对路径。 */
  readonly worktreeRoot: string;
}

/** Codex Host 使用的本地 Runtime 隔离契约。 */
export interface CodexAgentRuntimeIsolation {
  /** 创建并校验确定性的 Runtime 计划。 */
  createPlan(input: CodexAgentRuntimePlanInput): CodexAgentRuntimePlan;
  /** 按白名单创建隔离进程环境。 */
  createEnvironment(
    sourceEnv: Readonly<Record<string, string | undefined>>,
    plan: CodexAgentRuntimePlan,
  ): Readonly<Record<string, string>>;
  /** 准备隔离 Runtime。 */
  prepare(
    plan: CodexAgentRuntimePlan,
    overrides?: CodexAgentRuntimeIsolationOverrides,
  ): Promise<PreparedCodexAgentRuntime>;
  /** 验证源 auth.json 在准备后保持稳定。 */
  assertAuthSourceStable(
    plan: CodexAgentRuntimePlan,
    snapshot: CodexAgentAuthSourceSnapshot,
    overrides?: CodexAgentAuthIntegrityOverrides,
  ): Promise<CodexAgentAuthVerificationResult>;
  /** 拒绝宿主或工作树中的外部 Agent 配置。 */
  assertNoExternalAgentSkills(input: ExternalAgentSecurityInput): Promise<void>;
  /** 安全清理精确的 Runtime 根目录。 */
  cleanup(
    plan: CodexAgentRuntimePlan,
    overrides?: CodexAgentRuntimeCleanupOverrides,
  ): Promise<RemovedCodexAgentRuntime>;
}
