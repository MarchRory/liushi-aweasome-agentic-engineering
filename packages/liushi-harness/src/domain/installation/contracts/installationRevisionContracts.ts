import type { ContentDigest } from "#common/index.js";

import type { INSTALLATION_REVISION_SCHEMA_VERSION } from "../constants/index.js";
import type {
  InstallationRevisionEventType,
  InstallationRevisionStatus,
  ManagedFileActualKind,
  ManagedFileGateId,
} from "../enums/index.js";
import type { InstallationRevisionId, InstallPlanId } from "../identifiers/index.js";
import type { InstallPlan, PersistedManagedFileState } from "./installationContracts.js";

/** 不存在的受管文件内容快照。 */
export interface MissingManagedFileContentSnapshot {
  /** 受限的仓库相对路径。 */
  readonly path: string;
  /** 文件不存在。 */
  readonly kind: ManagedFileActualKind.Missing;
  /** 缺失文件禁止携带摘要。 */
  readonly digest?: never;
  /** 缺失文件禁止携带内容。 */
  readonly content?: never;
}

/** 已由外部校验内容摘要的普通文件快照。 */
export interface RegularManagedFileContentSnapshot {
  /** 受限的仓库相对路径。 */
  readonly path: string;
  /** 文件是普通文件。 */
  readonly kind: ManagedFileActualKind.RegularFile;
  /** 经外部校验的完整内容摘要。 */
  readonly digest: ContentDigest;
  /** 完整 UTF-8 文件内容。 */
  readonly content: string;
}

/** Installation Revision 保存或观察的完整文件状态。 */
export type ManagedFileContentSnapshot =
  MissingManagedFileContentSnapshot | RegularManagedFileContentSnapshot;

/** Human 对精确 InstallPlan 作出的 G0 批准。 */
export interface InstallationG0Approval {
  /** Gate 固定为 G0。 */
  readonly gate: ManagedFileGateId.G0ManagedFiles;
  /** 批准计划的 Human Actor。 */
  readonly actorId: string;
  /** 防止重复 Apply 的稳定幂等键。 */
  readonly idempotencyKey: string;
  /** 批准发生的 ISO 时间。 */
  readonly approvedAt: string;
  /** 被批准的精确计划 ID。 */
  readonly planId: InstallPlanId;
  /** 被批准的精确计划摘要。 */
  readonly planDigest: ContentDigest;
}

/** Apply 后预期写入的完整 Manifest 投影。 */
export interface ManagedManifestProjection {
  /** 待写入的完整 UTF-8 JSON 原文。 */
  readonly content: string;
  /** 经外部校验的投影内容摘要。 */
  readonly digest: ContentDigest;
  /** 与原文一致的受管条目。 */
  readonly entries: readonly PersistedManagedFileState[];
}

/** 任何 Repository 副作用前必须持久化的 Installation Revision Intent。 */
export interface InstallationRevisionIntent {
  /** Revision 唯一标识。 */
  readonly revisionId: InstallationRevisionId;
  /** 被批准且包含完整前置状态的计划。 */
  readonly plan: InstallPlan;
  /** 与计划 ID 和摘要绑定的 G0 批准。 */
  readonly approval: InstallationG0Approval;
  /** 按路径稳定排序的可写文件前镜像。 */
  readonly preimages: readonly ManagedFileContentSnapshot[];
  /** Apply 后的完整 Manifest 投影。 */
  readonly manifestAfter: ManagedManifestProjection;
  /** 按路径稳定排序且唯一的待创建目录。 */
  readonly createdDirectories: readonly string[];
}

/** 已完成一个可写文件原子替换的检查点。 */
export interface InstallationFileAppliedEvent {
  /** 事件类别固定为文件已应用。 */
  readonly type: InstallationRevisionEventType.FileApplied;
  /** 已完成应用的受管文件路径。 */
  readonly path: string;
  /** 检查点持久化时间。 */
  readonly recordedAt: string;
}

/** 已完成 Manifest 原子替换的检查点。 */
export interface InstallationManifestAppliedEvent {
  /** 事件类别固定为 Manifest 已应用。 */
  readonly type: InstallationRevisionEventType.ManifestApplied;
  /** 检查点持久化时间。 */
  readonly recordedAt: string;
}

/** 已验证全部 Apply 后置条件的检查点。 */
export interface InstallationPostconditionsVerifiedEvent {
  /** 事件类别固定为后置条件已验证。 */
  readonly type: InstallationRevisionEventType.PostconditionsVerified;
  /** 检查点持久化时间。 */
  readonly recordedAt: string;
}

/** Installation Revision 已最终提交的检查点。 */
export interface InstallationCommittedEvent {
  /** 事件类别固定为已提交。 */
  readonly type: InstallationRevisionEventType.Committed;
  /** 最终提交时间。 */
  readonly recordedAt: string;
}

/** Installation Revision 允许追加的封闭事件集合。 */
export type InstallationRevisionEvent =
  | InstallationFileAppliedEvent
  | InstallationManifestAppliedEvent
  | InstallationPostconditionsVerifiedEvent
  | InstallationCommittedEvent;

/** 可校验摘要的完整 Installation Revision 记录。 */
export interface InstallationRevisionRecord {
  /** Installation Revision Schema 版本。 */
  readonly schemaVersion: typeof INSTALLATION_REVISION_SCHEMA_VERSION;
  /** Revision 唯一标识。 */
  readonly revisionId: InstallationRevisionId;
  /** 执行前持久化的完整 Intent。 */
  readonly intent: InstallationRevisionIntent;
  /** 按持久化顺序追加的事件。 */
  readonly events: readonly InstallationRevisionEvent[];
  /** 排除本字段后计算的规范记录摘要。 */
  readonly recordDigest: ContentDigest;
}

/** 从完整 Revision 记录确定性重放得到的状态。 */
export interface InstallationRevisionState {
  /** 被重放的不可变记录。 */
  readonly record: InstallationRevisionRecord;
  /** 当前阶段状态。 */
  readonly status: InstallationRevisionStatus;
  /** 已持久化检查点的可写文件路径。 */
  readonly appliedPaths: readonly string[];
  /** Manifest 是否已有持久化检查点。 */
  readonly manifestApplied: boolean;
  /** 后置条件是否已有持久化检查点。 */
  readonly postconditionsVerified: boolean;
  /** 最终提交事件记录的时间。 */
  readonly committedAt?: string;
}
