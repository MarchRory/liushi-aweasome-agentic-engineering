import type {
  ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION,
  ContentDigest,
  PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
  PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
} from "#common/index.js";
import type { RuleDefinition } from "#domain/rule/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { PROJECT_SCANNER_VERSION } from "../constants/index.js";
import type {
  ProjectCandidateConfidence,
  ProjectConfigKind,
  ProjectConfigParseStatus,
  ProjectDependencyKind,
  ProjectDiagnosticCode,
  ProjectDiagnosticSeverity,
  ProjectDiscoveryStatus,
  ProjectMechanismKind,
  ProjectPackageManager,
  ProjectProfilePromotionStatus,
  RepositoryRole,
} from "../enums/index.js";

/** Repository 文件树的脱敏统计。 */
export interface ProjectInventorySummary {
  /** 已枚举的普通文件数。 */
  fileCount: number;
  /** 已枚举的目录数。 */
  directoryCount: number;
  /** 因安全策略跳过的 Symlink/Junction 数。 */
  skippedLinkCount: number;
  /** 因默认 Ignore Policy 未进入遍历的目录数。 */
  ignoredDirectoryCount: number;
}

/** 由文件扩展名确定性统计的语言事实。 */
export interface ProjectLanguageFact {
  /** 可扩展的语言 Registry ID。 */
  languageId: string;
  /** 该语言已发现的文件数。 */
  fileCount: number;
}

/** Scanner 对配置文件的脱敏处理结果。 */
export interface ProjectConfigFinding {
  /** 配置文件的封闭类别。 */
  kind: ProjectConfigKind;
  /** 配置文件在 Repository 内的相对路径。 */
  relativePath: string;
  /** 对原始文件字节计算的 Content Digest。 */
  contentDigest?: ContentDigest;
  /** Scanner 是否解析、仅记录存在或无法读取。 */
  parseStatus: ProjectConfigParseStatus;
}

/** Scanner 从 Lockfile 或 packageManager 字段提取的事实。 */
export interface ProjectPackageManagerFact {
  /** 被识别的 Package Manager。 */
  manager: ProjectPackageManager;
  /** 支撑判断的 Repository 相对路径。 */
  sourcePath: string;
}

/** Package Manifest 中的依赖声明事实。 */
export interface ProjectDependencyFact {
  /** 依赖包名。 */
  packageName: string;
  /** Manifest 声明的 Version Range。 */
  declaredRange: string;
  /** 依赖的封闭类别。 */
  kind: ProjectDependencyKind;
  /** 声明该依赖的 Package Manifest 相对路径。 */
  manifestPath: string;
}

/** 一个可结构化解析的 Package Manifest 摘要。 */
export interface ProjectPackageFact {
  /** Package Manifest 的相对路径。 */
  manifestPath: string;
  /** Manifest 声明的 Package Name。 */
  packageName?: string;
  /** Script Name 集合；不保存或执行 Script Body。 */
  scriptNames: readonly string[];
  /** Workspace Glob 集合。 */
  workspacePatterns: readonly string[];
  /** Manifest 中的依赖声明。 */
  dependencies: readonly ProjectDependencyFact[];
}

/** TypeScript/JavaScript Compiler 配置的显式事实。 */
export interface ProjectCompilerConfigFact {
  /** Compiler 配置相对路径。 */
  configPath: string;
  /** 是否显式启用 strict。 */
  strict?: boolean;
  /** 是否显式启用 forceConsistentCasingInFileNames。 */
  forceConsistentCasingInFileNames?: boolean;
  /** 是否显式启用 noUncheckedIndexedAccess。 */
  noUncheckedIndexedAccess?: boolean;
  /** 是否显式启用 exactOptionalPropertyTypes。 */
  exactOptionalPropertyTypes?: boolean;
  /** Compiler paths 中声明的 Alias Key。 */
  pathAliasKeys: readonly string[];
  /** 配置声明的 extends 引用；仅作为未解析事实。 */
  extendsRef?: string;
}

/** 从依赖声明确定性识别的 Framework/Tool Hint。 */
export interface ProjectFrameworkHint {
  /** 可扩展的 Framework Registry ID。 */
  frameworkId: string;
  /** 支撑 Hint 的 Package Name。 */
  packageName: string;
  /** Manifest 中声明的 Version Range。 */
  declaredRange: string;
  /** 支撑判断的 Manifest 相对路径。 */
  sourcePath: string;
}

/** Project Scanner 产生的结构化诊断。 */
export interface ProjectDiscoveryDiagnostic {
  /** 诊断的稳定代码。 */
  code: ProjectDiagnosticCode;
  /** 诊断严重程度。 */
  severity: ProjectDiagnosticSeverity;
  /** 诊断关联的 Repository。 */
  repositoryId: RepositoryId;
  /** 诊断关联的 Repository 相对路径。 */
  relativePath?: string;
  /** 不包含本机绝对路径的稳定说明。 */
  message: string;
}

/** 由目录结构提出且必须 Human Review 的架构机制候选。 */
export interface ArchitectureMechanismCandidate {
  /** Architecture Mechanism Candidate Schema Version。 */
  schemaVersion: typeof ARCHITECTURE_MECHANISM_CANDIDATE_SCHEMA_VERSION;
  /** 在当前 Repository 内确定性生成的 Candidate ID。 */
  candidateId: string;
  /** Candidate 所属 Repository。 */
  repositoryId: RepositoryId;
  /** 候选机制类别。 */
  kind: ProjectMechanismKind;
  /** 候选目录的 Repository 相对路径。 */
  relativePath: string;
  /** Candidate 证据的置信来源。 */
  confidence: ProjectCandidateConfidence;
  /** Candidate 为什么需要 Human 分类。 */
  rationale: string;
  /** 对 Candidate 机器字段计算的 Content Digest。 */
  digest: ContentDigest;
}

/** 单个 Repository 的 ProjectProfile 待评审候选。 */
export interface ProjectProfileCandidate {
  /** Project Profile Candidate Schema Version。 */
  schemaVersion: typeof PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION;
  /** Candidate 所属 Repository。 */
  repositoryId: RepositoryId;
  /** Candidate 绑定的 Repository Revision。 */
  repositoryRevision: string;
  /** Human 输入的初始 Role Hint。 */
  roleHint?: RepositoryRole;
  /** 当前 Repository 扫描完整性。 */
  status: ProjectDiscoveryStatus;
  /** 文件树脱敏统计。 */
  inventory: ProjectInventorySummary;
  /** 确定性语言统计。 */
  languages: readonly ProjectLanguageFact[];
  /** Package Manager 事实。 */
  packageManagers: readonly ProjectPackageManagerFact[];
  /** 结构化 Package Manifest 事实。 */
  packages: readonly ProjectPackageFact[];
  /** TypeScript/JavaScript Compiler 配置事实。 */
  compilerConfigs: readonly ProjectCompilerConfigFact[];
  /** Framework 与 Tool Hint。 */
  frameworkHints: readonly ProjectFrameworkHint[];
  /** 配置文件处理结果。 */
  configFiles: readonly ProjectConfigFinding[];
  /** 仅供 Human Review 的架构机制候选。 */
  mechanismCandidates: readonly ArchitectureMechanismCandidate[];
  /** 状态固定为 Candidate 的 Rule Definition。 */
  ruleCandidates: readonly RuleDefinition[];
  /** 扫描缺口、风险和安全跳过记录。 */
  diagnostics: readonly ProjectDiscoveryDiagnostic[];
  /** 对 Candidate 全部机器字段计算的 Content Digest。 */
  digest: ContentDigest;
}

/** 多仓 Package 声明产生的依赖边候选。 */
export interface ProjectDependencyEdgeCandidate {
  /** 依赖发起 Repository。 */
  fromRepositoryId: RepositoryId;
  /** 被依赖 Repository。 */
  toRepositoryId: RepositoryId;
  /** Package Manifest 中的依赖类别。 */
  kind: ProjectDependencyKind;
  /** 用于匹配 Repository 的 Package Name。 */
  packageName: string;
  /** 声明依赖的 Manifest 相对路径。 */
  sourcePath: string;
}

/** 多个 Repository 声明同名 Package 时无法唯一解析的依赖候选。 */
export interface ProjectDependencyAmbiguityCandidate {
  /** 依赖发起 Repository。 */
  fromRepositoryId: RepositoryId;
  /** Package Manifest 中的依赖类别。 */
  kind: ProjectDependencyKind;
  /** 无法唯一匹配 Owner 的 Package Name。 */
  packageName: string;
  /** 声明依赖的 Manifest 相对路径。 */
  sourcePath: string;
  /** 声明该 Package 的候选 Repository，按 Repository ID 稳定排序。 */
  owners: readonly RepositoryId[];
}

/** 显式多仓只读扫描的完整报告。 */
export interface ProjectDiscoveryReport {
  /** Project Discovery Report Schema Version。 */
  schemaVersion: typeof PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION;
  /** 生成报告的确定性 Scanner Version。 */
  scannerVersion: typeof PROJECT_SCANNER_VERSION;
  /** 报告所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** 报告绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** 所有 Repository Candidate 的聚合完整性。 */
  status: ProjectDiscoveryStatus;
  /** Profile Candidate 进入 Promotion 前的人工门禁状态。 */
  profilePromotionStatus: ProjectProfilePromotionStatus;
  /** 每个显式 Repository 的 ProjectProfile Candidate。 */
  profileCandidates: readonly ProjectProfileCandidate[];
  /** 由 Package Name 匹配形成的跨仓依赖边候选。 */
  dependencyEdges: readonly ProjectDependencyEdgeCandidate[];
  /** 因 Package Name 存在多个 Owner 而无法唯一解析的依赖候选。 */
  dependencyAmbiguities: readonly ProjectDependencyAmbiguityCandidate[];
  /** 对报告全部机器字段计算的 Content Digest。 */
  digest: ContentDigest;
}

/** 计算 Architecture Mechanism Candidate Digest 的输入。 */
export type ArchitectureMechanismCandidateDigestInput = Omit<
  ArchitectureMechanismCandidate,
  "digest"
>;

/** 计算 Project Profile Candidate Digest 的输入。 */
export type ProjectProfileCandidateDigestInput = Omit<ProjectProfileCandidate, "digest">;

/** 计算 Project Discovery Report Digest 的输入。 */
export type ProjectDiscoveryReportDigestInput = Omit<ProjectDiscoveryReport, "digest">;
