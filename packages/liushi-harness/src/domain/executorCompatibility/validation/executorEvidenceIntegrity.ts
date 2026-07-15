import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";

import type {
  ExecutorCapabilityEvidence,
  ExecutorCompatibilityDigestPort,
} from "../contracts/index.js";
import { createExecutorCapabilityEvidenceDigestInput } from "../digest/index.js";

/** 重算并校验每份归一化 Executor Capability Evidence 的摘要。 */
export function validateExecutorCapabilityEvidenceDigests(
  evidence: readonly ExecutorCapabilityEvidence[],
  digestPort: ExecutorCompatibilityDigestPort,
): Result<void, HarnessError> {
  for (const item of evidence) {
    const calculated = digestPort.calculate(createExecutorCapabilityEvidenceDigestInput(item));
    if (calculated.status === ResultStatus.Failure) return calculated;
    if (calculated.value !== item.evidenceDigest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Executor capability evidence digest drifted.",
        ),
      );
    }
  }
  return success(undefined);
}
