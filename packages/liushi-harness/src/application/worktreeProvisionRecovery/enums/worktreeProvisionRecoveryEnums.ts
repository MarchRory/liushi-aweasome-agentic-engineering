/** Worktree Provision 恢复写入 Action Journal 的阶段。 */
export enum WorktreeProvisionRecoveryJournalPhase {
  /** 补全已有 Observation 的 Resolution。 */
  ExistingResolution = "existing_resolution",
  /** 写入恢复现场 Observation。 */
  RecoveryObservation = "recovery_observation",
  /** 写入恢复现场 Resolution。 */
  RecoveryResolution = "recovery_resolution",
}
