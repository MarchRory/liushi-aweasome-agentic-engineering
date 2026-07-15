import type { HarnessError, Result } from "#common/index.js";
import type { DesiredManagedFile, InstallationTarget } from "#domain/installation/index.js";

/** 将单一执行器 Profile 投影为完整 Desired Managed Files 的边界。 */
export interface InstallProfileProjector {
  /** 生成目标执行器的确定性 Desired State。 */
  project(target: InstallationTarget): Result<readonly DesiredManagedFile[], HarnessError>;
}
