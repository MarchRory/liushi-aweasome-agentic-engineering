/** 安装计划支持的执行器目标。 */
export enum InstallationTarget {
  /** Codex 原生配置投影。 */
  Codex = "codex",
}

/** 受管文件生命周期使用的 Human Gate。 */
export enum ManagedFileGateId {
  /** Apply 前必须由 Human 审阅并绑定精确 InstallPlan。 */
  G0ManagedFiles = "G0",
}

/** 受管文件当前现场状态。 */
export enum ManagedFileActualKind {
  /** 目标文件不存在。 */
  Missing = "missing",
  /** 目标是可读取的普通文件。 */
  RegularFile = "regular_file",
  /** 目标或其父路径不支持安全读取。 */
  Unsupported = "unsupported",
}

/** 文件计划在后续 Apply 中可采取的动作。 */
export enum FileInstallAction {
  /** 创建缺失的受管文件。 */
  Create = "create",
  /** 更新未漂移的受管文件。 */
  Update = "update",
  /** 保留已是所需内容的受管文件。 */
  Skip = "skip",
  /** 拒绝覆盖人类文件、漂移或损坏状态。 */
  Conflict = "conflict",
}

/** 受管清单的读取状态。 */
export enum ManagedManifestState {
  /** 清单不存在，等价于空清单。 */
  Missing = "missing",
  /** 清单通过了严格校验。 */
  Present = "present",
  /** 清单格式或所有权语义损坏。 */
  Corrupt = "corrupt",
}

/** Manifest 所有权声明的运行时验证状态。 */
export enum ManagedOwnershipProvenance {
  /** 仅来自 Repository 自声明，不能授权 Update、Skip、Rollback 或 Uninstall。 */
  UnverifiedClaim = "unverified_claim",
  /** 已由 Runtime Store 中成功提交的 Installation Revision 证明。 */
  VerifiedRevision = "verified_revision",
}

/** Installation Revision 阶段日志允许追加的封闭事件类别。 */
export enum InstallationRevisionEventType {
  /** 一个可写文件已原子应用。 */
  FileApplied = "file_applied",
  /** 受管 Manifest 已原子应用。 */
  ManifestApplied = "manifest_applied",
  /** 全部 Apply 后置条件已经验证。 */
  PostconditionsVerified = "postconditions_verified",
  /** Installation Revision 已最终提交。 */
  Committed = "committed",
}

/** Installation Revision 从阶段日志归约得到的当前状态。 */
export enum InstallationRevisionStatus {
  /** 副作用前 Intent 已持久化。 */
  IntentPersisted = "intent_persisted",
  /** 一个或多个受管文件正在按计划应用。 */
  FilesApplying = "files_applying",
  /** Manifest 已应用。 */
  ManifestApplied = "manifest_applied",
  /** 后置条件已经验证。 */
  PostconditionsVerified = "postconditions_verified",
  /** Revision 已最终提交。 */
  Committed = "committed",
}

/** 中断后的现场状态允许采取的封闭恢复处置。 */
export enum InstallationRecoveryDisposition {
  /** 现场仍完全等于前置状态，允许从头重启。 */
  RestartPermitted = "restart_permitted",
  /** 所有目标和 Manifest 均已完成。 */
  Complete = "complete",
  /** 现场只包含前置或目标状态，允许按 Intent 回滚。 */
  RollbackPermitted = "rollback_permitted",
  /** 发现不一致或未知漂移，必须由 Human 处理。 */
  HumanRequired = "human_required",
}

/** 幂等 Apply 调用对副作用的处置结果。 */
export enum InstallationApplyDisposition {
  /** 本次调用执行了 Apply。 */
  Applied = "applied",
  /** 本次调用复用了已经完成的 Apply。 */
  Reused = "reused",
}
