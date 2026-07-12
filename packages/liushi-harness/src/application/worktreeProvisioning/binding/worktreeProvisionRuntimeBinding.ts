import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type { ProvisionWorktreeRuntimeContext } from "../contracts/index.js";

/** 对本机 Repository Root 计算不泄露路径明文的 Runtime Binding Digest。 */
export function calculateWorktreeProvisionRuntimeDigest(
  digest: ContentDigestPort,
  runtime: ProvisionWorktreeRuntimeContext,
): Result<ContentDigest, HarnessError> {
  return digest.calculate({ repositoryRoot: runtime.repositoryRoot });
}
