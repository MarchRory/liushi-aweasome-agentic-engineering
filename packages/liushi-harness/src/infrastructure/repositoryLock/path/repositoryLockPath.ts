import { join } from "node:path";

import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

/** 生成不泄露到公共报告的 Runtime Repository Lock 文件路径。 */
export function resolveRepositoryLockPath(
  storeRoot: string,
  workspaceId: WorkspaceId,
  repositoryId: RepositoryId,
): string {
  return join(storeRoot, "repositoryLocks", workspaceId, `${repositoryId}.lock`);
}
