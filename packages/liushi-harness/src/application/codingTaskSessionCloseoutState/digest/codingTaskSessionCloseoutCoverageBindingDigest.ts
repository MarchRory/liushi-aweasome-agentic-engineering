import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import { CODING_TASK_SESSION_CLOSEOUT_COVERAGE_BINDING_SCHEMA_VERSION } from "../constants/index.js";
import type { CodingTaskSessionCloseoutCoverageBindingDigestInput } from "../contracts/index.js";

/** 构造 Snapshot 与 Coverage Manifest 的唯一外层绑定输入。 */
export function createCloseoutCoverageBindingDigestInput(
  snapshotDigest: ContentDigest,
  manifestDigest: ContentDigest,
): CodingTaskSessionCloseoutCoverageBindingDigestInput {
  return {
    schemaVersion: CODING_TASK_SESSION_CLOSEOUT_COVERAGE_BINDING_SCHEMA_VERSION,
    snapshotDigest,
    manifestDigest,
  };
}

/** 使用 ContentDigestPort 计算 Closeout Coverage 外层绑定摘要。 */
export function calculateCloseoutCoverageBindingDigest(
  snapshotDigest: ContentDigest,
  manifestDigest: ContentDigest,
  digestPort: ContentDigestPort,
): Result<ContentDigest, HarnessError> {
  return digestPort.calculate(
    createCloseoutCoverageBindingDigestInput(snapshotDigest, manifestDigest),
  );
}
