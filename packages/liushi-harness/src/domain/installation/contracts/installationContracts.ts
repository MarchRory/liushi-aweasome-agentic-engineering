import type { ContentDigest } from "#common/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { InstallationRevisionId, InstallPlanId } from "../identifiers/index.js";
import type {
  FileInstallAction,
  InstallationTarget,
  ManagedFileGateId,
  ManagedFileActualKind,
  ManagedManifestState,
  ManagedOwnershipProvenance,
} from "../enums/index.js";

/** 受管文件的不可变来源和所有权元数据。 */
export interface ManagedFileMetadata {
  /** 所有该文件的 Harness 包名。 */
  readonly ownerPackage: string;
  /** 生成该文件的执行器 profile。 */
  readonly profile: string;
  /** 生成时使用的包版本。 */
  readonly packageVersion: string;
  /** 模板稳定标识。 */
  readonly template: string;
  /** 模板来源稳定标识。 */
  readonly source: string;
  /** 生成输入的规范摘要，用于审计同名来源的内容演进。 */
  readonly sourceDigest: ContentDigest;
}

/** Desired State，包含供未来 Apply 使用的完整内容。 */
export interface DesiredManagedFile {
  /** 受限的仓库相对路径。 */
  readonly path: string;
  /** 完整 UTF-8 目标内容。 */
  readonly content: string;
  /** 内容的规范摘要。 */
  readonly digest: ContentDigest;
  /** 所有权元数据。 */
  readonly metadata: ManagedFileMetadata;
}

/** 从仓库读取的实际文件状态。 */
export interface ActualManagedFileState {
  /** 状态对应的受限相对路径。 */
  readonly path: string;
  /** 现场文件类型。 */
  readonly kind: ManagedFileActualKind;
  /** 普通文件时的完整内容摘要。 */
  readonly digest?: ContentDigest;
}

/** 首次取得文件所有权前的现场状态；完整恢复内容保存在对应 Revision。 */
export interface ManagedFileOriginalState {
  /** 原始目标不存在或为普通文件。 */
  readonly kind: ManagedFileActualKind.Missing | ManagedFileActualKind.RegularFile;
  /** 原始目标为普通文件时的内容摘要。 */
  readonly digest?: ContentDigest;
}

/** 已持久化在仓库 manifest 中的所有权条目。 */
export interface PersistedManagedFileState {
  /** 受限的仓库相对路径。 */
  readonly path: string;
  /** 上次成功 Apply 的内容摘要。 */
  readonly lastAppliedDigest: ContentDigest;
  /** 声明该所有权的 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 声明该所有权的已提交 Installation Revision。 */
  readonly installationRevisionId: InstallationRevisionId;
  /** 生成该 Revision 的精确 InstallPlan 摘要。 */
  readonly installPlanDigest: ContentDigest;
  /** 首次取得所有权前的现场状态。 */
  readonly original: ManagedFileOriginalState;
  /** Repository 声明是否已由 Runtime Store 证明。 */
  readonly provenance: ManagedOwnershipProvenance;
  /** 所有权元数据。 */
  readonly metadata: ManagedFileMetadata;
}

/** 已从未知输入严格解析、尚未绑定现场原文的 Manifest。 */
export interface ParsedManagedManifestSnapshot {
  /** 已解析清单固定为存在状态。 */
  readonly state: ManagedManifestState.Present;
  /** 已验证的条目。 */
  readonly entries: readonly PersistedManagedFileState[];
}

/** 已绑定现场原文及摘要的 Manifest 快照。 */
export interface PresentManagedManifestSnapshot extends ParsedManagedManifestSnapshot {
  /** 现场读取到的完整 UTF-8 原文。 */
  readonly content: string;
  /** 经外部校验的现场原文 SHA-256 摘要。 */
  readonly digest: ContentDigest;
}

/** 明确不存在且不携带伪造内容或摘要的 Manifest 快照。 */
export interface MissingManagedManifestSnapshot {
  /** 清单不存在。 */
  readonly state: ManagedManifestState.Missing;
  /** 缺失清单没有条目。 */
  readonly entries: readonly [];
  /** 缺失清单禁止携带内容。 */
  readonly content?: never;
  /** 缺失清单禁止携带摘要。 */
  readonly digest?: never;
}

/** 安装计划绑定的完整 Manifest 前置状态。 */
export type ManagedManifestSnapshot =
  MissingManagedManifestSnapshot | PresentManagedManifestSnapshot;

/** 单个受管文件的完整计划状态。 */
export interface FileInstallPlan {
  /** 稳定排序的仓库相对路径。 */
  readonly path: string;
  /** 后续 Apply 可执行的决定。 */
  readonly action: FileInstallAction;
  /** 完整 Desired State。 */
  readonly desired: DesiredManagedFile;
  /** 当前 Actual State。 */
  readonly actual: ActualManagedFileState;
  /** 已持久化所有权状态。 */
  readonly persisted?: PersistedManagedFileState;
}

/** 可审计且不可变的安装计划。 */
export interface InstallPlan {
  /** 持久化结构版本。 */
  readonly schemaVersion: number;
  /** 计划唯一 ID。 */
  readonly planId: InstallPlanId;
  /** 排除本字段后的规范计划摘要。 */
  readonly planDigest: ContentDigest;
  /** 计划所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** 单一写入 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 经验证的绝对 Repository 根目录。 */
  readonly root: string;
  /** 目标执行器。 */
  readonly target: InstallationTarget;
  /** 计划创建 ISO 时间。 */
  readonly createdAt: string;
  /** 计划创建 actor。 */
  readonly createdBy: string;
  /** Apply 所需的人类 Gate。 */
  readonly requiredGate: ManagedFileGateId;
  /** 计划生成时完整的 Manifest 前置状态。 */
  readonly manifest: ManagedManifestSnapshot;
  /** 按路径稳定排序的文件计划。 */
  readonly files: readonly FileInstallPlan[];
}
