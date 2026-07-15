import { resolve } from "node:path";

import type { InstallPlanId } from "#domain/installation/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** 派生只含已校验身份片段的 InstallPlan 记录与锁路径。 */
export function resolveInstallPlanStorePaths(
  root: string,
  workspaceId: WorkspaceId,
  planId: InstallPlanId,
): { readonly recordFile: string; readonly lockFile: string } {
  const directory = resolve(root, "install-plans", workspaceId);
  return {
    recordFile: resolve(directory, `${planId}.json`),
    lockFile: resolve(directory, `${planId}.lock`),
  };
}
