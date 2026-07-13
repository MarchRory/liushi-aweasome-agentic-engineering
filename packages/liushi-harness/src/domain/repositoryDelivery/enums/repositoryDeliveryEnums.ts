/** Repository Delivery Artifact 的封闭类型集合。 */
export enum RepositoryDeliveryArtifactType {
  /** 已通过验证并可进入人工 Review 的单仓交付 Artifact。 */
  PrReady = "pr_ready",
}

/** 仓库依赖影响评估的封闭状态集合。 */
export enum DependencyAssessmentStatus {
  /** 当前切片尚未执行依赖影响评估。 */
  NotAssessed = "not_assessed",
}
