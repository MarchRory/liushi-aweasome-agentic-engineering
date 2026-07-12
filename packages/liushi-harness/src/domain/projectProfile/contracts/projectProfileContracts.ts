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
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { ApprovalId } from "#domain/approval/index.js";
import type { ProjectProfileConfirmedRole } from "#domain/artifact/index.js";
import type { TaskId } from "#domain/task/index.js";

/** 纯领域 Project Profile 编译器使用的 Digest 端口。 */
export interface ProjectProfileDigestPort {
  /** 为 JSON 兼容输入计算稳定 Content Digest。 */
  calculate(input: unknown): Result<ContentDigest, HarnessError>;
}

/** 证明已编译 Profile 来源于哪个已批准 Proposal 的来源引用。 */
export interface ProjectProfileSourceRefs {
  /** Proposal 接受的当前 ProjectDiscoveryReport Digest。 */
  discoveryReportDigest: ContentDigest;
  /** 已批准的 ProjectProfileProposal Artifact Digest。 */
  /** Proposal 接受的 ProjectProfileCandidate Digest。 */
  profileCandidateDigest: ContentDigest;
  /** 已批准的 ProjectProfileProposal Artifact Digest。 */
  proposalArtifactDigest: ContentDigest;
  /** 授权本次提升的 Human Approval ID。 */
  approvalId: ApprovalId;
}

/** 从已接受 ProjectProfileCandidate 复制的机器事实。 */
export interface ProjectProfileFacts {
  /** 文件树清单摘要。 */
  inventory: ProjectInventorySummary;
  /** 确定性语言事实。 */
  languages: readonly ProjectLanguageFact[];
  /** 确定性包管理器事实。 */
  packageManagers: readonly ProjectPackageManagerFact[];
  /** 确定性 package manifest 事实。 */
  packages: readonly ProjectPackageFact[];
  /** 确定性编译器配置事实。 */
  compilerConfigs: readonly ProjectCompilerConfigFact[];
  /** 确定性 framework hint。 */
  frameworkHints: readonly ProjectFrameworkHint[];
  /** 确定性配置文件发现结果。 */
  configFiles: readonly ProjectConfigFinding[];
}

/** 为单个 Repository 编译出的已确认 Project Profile。 */
export interface ProjectProfile {
  /** Project Profile schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_SCHEMA_VERSION;
  /** 此 Profile 描述的 Repository。 */
  /** Discovery Report 绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** Discovery 和 Approval 共同绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** Approval Provenance 提供的 Profile Revision。 */
  revision: number;
  /** 此 Profile 描述的 Repository。 */
  repositoryId: RepositoryId;
  /** Discovery 和 Approval 共同绑定的 Repository Revision。 */
  repositoryRevision: string;
  /** Human 确认的 Repository Role。 */
  confirmedRole: ProjectProfileConfirmedRole;
  /** 提升进入 Profile 的 Candidate 事实。 */
  facts: ProjectProfileFacts;
  /** Human 接受的 Architecture Mechanism。 */
  acceptedMechanisms: readonly ArchitectureMechanismCandidate[];
  /** 审计所需的最小来源引用。 */
  sourceRefs: ProjectProfileSourceRefs;
  /** Profile 机器字段的稳定 Digest。 */
  digest: ContentDigest;
}

/** 严格解析 Artifact 后由 Approval Workflow 提供的来源信息。 */
export interface ProjectProfileCompilerProvenance {
  /** 编译所绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** 编译所绑定的 Task ID，仅作为审批来源身份。 */
  taskId: TaskId;
  /** 已批准 ProjectProfileProposal Artifact 的 Digest。 */
  proposalArtifactDigest: ContentDigest;
  /** 授权编译的 Approval ID。 */
  approvalId: ApprovalId;
  /** Human Approval 的审计时间，同时作为 Active Rule 的 reviewedAt。 */
  approvedAt: string;
  /** 单调递增的已编译 Bundle Revision。 */
  revision: number;
}

/** 针对某个 Workspace Graph Revision 编译出的 Project Profile Bundle。 */
export interface ProjectProfileBundle {
  /** Project Profile Bundle schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION;
  /** Discovery Report 绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** Discovery 和 Approval 共同绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** Approval Provenance 提供的 Bundle Revision。 */
  revision: number;
  /** 确定性排序后的已编译 Profile。 */
  profiles: readonly ProjectProfile[];
  /** 包含已接受并提升为 Active 的 Rule Catalog。 */
  ruleCatalog: ProjectRuleCatalog;
  /** Bundle 对应的 Approval Provenance。 */
  provenance: ProjectProfileCompilerProvenance;
  /** 已编译 Bundle 的稳定 Digest。 */
  digest: ContentDigest;
}

/** 排除自引用 digest 的 Project Profile Digest 输入。 */
export type ProjectProfileDigestInput = Omit<ProjectProfile, "digest">;

/** 排除嵌套易变 Catalog 结构的 Project Profile Bundle Digest 输入。 */
export interface ProjectProfileBundleDigestInput {
  /** Project Profile Bundle schema 版本。 */
  schemaVersion: typeof PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION;
  /** Discovery Report 绑定的 Workspace ID。 */
  workspaceId: WorkspaceId;
  /** Discovery 和 Approval 共同绑定的 Workspace Graph Revision。 */
  workspaceGraphRevision: string;
  /** Approval Provenance 提供的 Bundle Revision。 */
  revision: number;
  /** 确定性排序后的已编译 Profile。 */
  profiles: readonly ProjectProfile[];
  /** 已编译 Rule Catalog 的 Digest。 */
  ruleCatalogDigest: ContentDigest;
  /** Bundle 对应的 Approval Provenance。 */
  provenance: ProjectProfileCompilerProvenance;
}

/** 从单个 Repository Candidate 编译出的 Active Rule 和 Profile。 */
export interface CompiledRepositoryProfile {
  /** 已编译 Profile。 */
  profile: ProjectProfile;
  /** 从 Candidate 提升为 Active 的已接受 Rule。 */
  activeRules: readonly RuleDefinition[];
}
