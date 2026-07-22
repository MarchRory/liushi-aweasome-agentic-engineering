import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { HarnessError, Result } from "#common/index.js";

/** 读取 Draft 后执行的领域重建验证器。 */
export type ReleaseDraftValidator<TDraft> = (
  input: unknown,
  digest: ContentDigestPort,
) => Result<TDraft, HarnessError>;
