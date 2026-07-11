import {
  ProjectDiscoveryStatus,
  ProjectProfilePromotionStatus,
  type ProjectDiscoveryReport,
} from "#domain/projectDiscovery/index.js";

/** 判断 Project Discovery Report 是否禁止进入 Profile Promotion。 */
export function isProjectDiscoveryBlocked(report: ProjectDiscoveryReport): boolean {
  return report.status !== ProjectDiscoveryStatus.Complete;
}

/** 判断 Project Discovery Report 是否被人工门禁阻止进入 Profile Promotion。 */
export function isProjectProfilePromotionBlocked(report: ProjectDiscoveryReport): boolean {
  return report.profilePromotionStatus === ProjectProfilePromotionStatus.HumanReviewRequired;
}
