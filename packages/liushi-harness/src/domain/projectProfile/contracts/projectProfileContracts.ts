import type {
  ContentDigest,
  HarnessError,
  PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION,
  PROJECT_PROFILE_SCHEMA_VERSION,
  Result,
} from "#common/index.js";
import type {
  ArchitectureMechanismCandidate,
  ProjectConfigFinding,
  ProjectCompilerConfigFact,
  ProjectFrameworkHint,
  ProjectInventorySummary,
  ProjectLanguageFact,
  ProjectPackageFact,
  ProjectPackageManagerFact,
} from "#domain/projectDiscovery/index.js";
import type { ProjectRuleCatalog, RuleDefinition } from "#domain/rule/index.js";
import type { ProjectVerificationCheck } from "#domain/verification/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { ApprovalId } from "#domain/approval/index.js";
import type { ProjectProfileConfirmedRole } from "#domain/artifact/index.js";
import type { TaskId } from "#domain/task/index.js";

/** Project Profile 编译器使用的摘要端口。 */
export interface ProjectProfileDigestPort {
  /** 为 JSON 兼容输入计算稳定的内容摘要。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** 已编译 Profile 对已批准 Proposal 的最小来源引用。 */
export interface ProjectProfileSourceRefs {
  /** Proposal 绑定的 Project Discovery Report 摘要。 */
  discoveryReportDigest: ContentDigest;
  /** Proposal 绑定的 Project Profile Candidate 摘要。 */
  profileCandidateDigest: ContentDigest;
  /** 已批准的 Project Profile Proposal Artifact 摘要。 */
  proposalArtifactDigest: ContentDigest;
  /** 授权本次编译的 Human Approval ID。 */
  approvalId: ApprovalId;
}

/** 从已接受 Project Profile Candidate 复制的机器事实。 */
export interface ProjectProfileFacts {
  /** 文件树清单摘要。 */
  inventory: ProjectInventorySummary;
  /** 确定性的语言事实。 */
  languages: readonly ProjectLanguageFact[];
  /** 确定性的包管理器事实。 */
  packageManagers: readonly ProjectPackageManagerFact[];
  /** 确定性的 package manifest 事实。 */
  packages: readonly ProjectPackageFact[];
  /** 确定性的编译器配置事实。 */
  compilerConfigs: readonly ProjectCompilerConfigFact[];
  /** 确定性的 framework hint。 */
  frameworkHints: readonly ProjectFrameworkHint[];
  /** 确定性的配置文件发现结果。 */
  configFiles: readonly ProjectConfigFinding[];
}

/** 为单个仓库编译的已确认 Project Profile。 */
export interface ProjectProfile {
  /** Project Profile Schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_SCHEMA_VERSION;
  /** Discovery Report 绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** Discovery 与 Approval 共同绑定的 Workspace Graph 版本。 */
  workspaceGraphRevision: string;
  /** Approval Provenance 提供的 Profile 版本。 */
  revision: number;
  /** Profile 描述的仓库。 */
  repositoryId: RepositoryId;
  /** Discovery 与 Approval 共同绑定的仓库版本。 */
  repositoryRevision: string;
  /** Human 确认的仓库角色。 */
  confirmedRole: ProjectProfileConfirmedRole;
  /** 提升进入 Profile 的 Candidate 事实。 */
  facts: ProjectProfileFacts;
  /** Human 接受的 Architecture Mechanism。 */
  acceptedMechanisms: readonly ArchitectureMechanismCandidate[];
  /** Human/G8 确认的项目验证检查。 */
  verificationChecks: readonly ProjectVerificationCheck[];
  /** 审计所需的最小来源引用。 */
  sourceRefs: ProjectProfileSourceRefs;
  /** Profile 机器字段的稳定摘要。 */
  digest: ContentDigest;
}

/** 严格解析 Artifact 后由 Approval Workflow 提供的来源信息。 */
export interface ProjectProfileCompilerProvenance {
  /** 编译绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** 编译绑定的 Task ID，仅用于审批来源身份。 */
  taskId: TaskId;
  /** 已批准 Project Profile Proposal Artifact 的摘要。 */
  proposalArtifactDigest: ContentDigest;
  /** 授权编译的 Approval ID。 */
  approvalId: ApprovalId;
  /** Human Approval 的审计时间，同时作为 Active Rule 的 reviewedAt。 */
  approvedAt: string;
  /** 单调递增的已编译 Bundle 版本。 */
  revision: number;
}

/** 针对某个 Workspace Graph 版本编译的 Project Profile Bundle。 */
export interface ProjectProfileBundle {
  /** Project Profile Bundle Schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION;
  /** Discovery Report 绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** Discovery 与 Approval 共同绑定的 Workspace Graph 版本。 */
  workspaceGraphRevision: string;
  /** Approval Provenance 提供的 Bundle 版本。 */
  revision: number;
  /** 按确定性顺序排列的已编译 Profile。 */
  profiles: readonly ProjectProfile[];
  /** 包含已接受并提升为 Active 的 Rule Catalog。 */
  ruleCatalog: ProjectRuleCatalog;
  /** Bundle 对应的 Approval Provenance。 */
  provenance: ProjectProfileCompilerProvenance;
  /** 已编译 Bundle 的稳定摘要。 */
  digest: ContentDigest;
}

/** 排除自引用 digest 的 Project Profile 摘要输入。 */
export type ProjectProfileDigestInput = Omit<ProjectProfile, "digest">;

/** 排除嵌套易变 Catalog 结构的 Project Profile Bundle 摘要输入。 */
export interface ProjectProfileBundleDigestInput {
  /** Project Profile Bundle Schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION;
  /** Discovery Report 绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** Discovery 与 Approval 共同绑定的 Workspace Graph 版本。 */
  workspaceGraphRevision: string;
  /** Approval Provenance 提供的 Bundle 版本。 */
  revision: number;
  /** 按确定性顺序排列的已编译 Profile。 */
  profiles: readonly ProjectProfile[];
  /** 已编译 Rule Catalog 的摘要。 */
  ruleCatalogDigest: ContentDigest;
  /** Bundle 对应的 Approval Provenance。 */
  provenance: ProjectProfileCompilerProvenance;
}

/** 从单个仓库 Candidate 编译的 Active Rule 与 Profile。 */
export interface CompiledRepositoryProfile {
  /** 已编译 Profile。 */
  profile: ProjectProfile;
  /** 从 Candidate 提升为 Active 的已接受 Rule。 */
  activeRules: readonly RuleDefinition[];
}
