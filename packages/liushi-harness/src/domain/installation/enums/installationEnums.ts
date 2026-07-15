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
