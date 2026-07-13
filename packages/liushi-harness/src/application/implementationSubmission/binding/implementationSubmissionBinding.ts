import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type { ImplementationSubmissionRuntimeContext } from "../contracts/index.js";

/** 对本机 Repository Root 计算不可逆摘要。 */
export function calculateImplementationSubmissionRuntimeDigest(
  digest: ContentDigestPort,
  runtime: ImplementationSubmissionRuntimeContext,
): Result<ContentDigest, HarnessError> {
  return digest.calculate({ repositoryRoot: runtime.repositoryRoot });
}
