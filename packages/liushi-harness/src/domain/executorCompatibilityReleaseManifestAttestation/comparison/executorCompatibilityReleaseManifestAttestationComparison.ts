import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";

import type { ExecutorCompatibilityReleaseManifestAttestationDigestPort } from "../contracts/index.js";

/** 使用 RFC 8785 摘要判断两个 Manifest Attestation 值是否规范等价。 */
export function sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue(
  left: unknown,
  right: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestAttestationDigestPort,
): Result<boolean, HarnessError> {
  const leftDigest = digestPort.calculate(left);
  if (leftDigest.status === ResultStatus.Failure) return leftDigest;
  const rightDigest = digestPort.calculate(right);
  if (rightDigest.status === ResultStatus.Failure) return rightDigest;
  return success(leftDigest.value === rightDigest.value);
}
