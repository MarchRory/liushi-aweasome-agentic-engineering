import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";

import { buildExecutorCompatibilityMatrix } from "../calculation/index.js";
import { EXECUTOR_COMPATIBILITY_MATRIX_SCHEMA_VERSION } from "../constants/index.js";
import type {
  ExecutorCapabilityEvidence,
  ExecutorCompatibilityDigestPort,
  ExecutorCompatibilityMatrix,
  ExecutorCompatibilityPolicy,
} from "../contracts/index.js";
import { createExecutorCompatibilityMatrixDigestInput } from "../digest/index.js";
import { executorCompatibilityMatrixSchema } from "../schemas/index.js";
import { validateExecutorCompatibilityInput } from "./executorCompatibilityValidation.js";
import { validateExecutorCapabilityEvidenceDigests } from "./executorEvidenceIntegrity.js";

/** 使用受信 Policy 与 Evidence 重编译并校验持久化 Matrix，不能只信任 Matrix 自报状态。 */
export function validateExecutorCompatibilityMatrix(
  matrix: ExecutorCompatibilityMatrix,
  policy: ExecutorCompatibilityPolicy,
  trustedEvidence: readonly ExecutorCapabilityEvidence[],
  digestPort: ExecutorCompatibilityDigestPort,
): Result<void, HarnessError> {
  const parsed = executorCompatibilityMatrixSchema.safeParse(matrix);
  if (!parsed.success) return invalid("Executor compatibility matrix schema is invalid.");
  if (matrix.schemaVersion !== EXECUTOR_COMPATIBILITY_MATRIX_SCHEMA_VERSION) {
    return invalid("Executor compatibility matrix schema version is unsupported.");
  }

  const inputValidation = validateExecutorCompatibilityInput({
    scope: matrix.scope,
    policy,
    evidence: trustedEvidence,
  });
  if (inputValidation.status === ResultStatus.Failure) return inputValidation;
  const evidenceIntegrity = validateExecutorCapabilityEvidenceDigests(trustedEvidence, digestPort);
  if (evidenceIntegrity.status === ResultStatus.Failure) return evidenceIntegrity;

  const persistedDigest = digestPort.calculate(
    createExecutorCompatibilityMatrixDigestInput(matrix),
  );
  if (persistedDigest.status === ResultStatus.Failure) return persistedDigest;
  if (persistedDigest.value !== matrix.matrixDigest) {
    return invalid("Executor compatibility matrix digest drifted.");
  }

  const expected = buildExecutorCompatibilityMatrix(
    matrix.scope,
    policy,
    trustedEvidence,
    digestPort,
  );
  if (expected.status === ResultStatus.Failure) return expected;
  return expected.value.matrixDigest === matrix.matrixDigest
    ? success(undefined)
    : invalid("Executor compatibility matrix does not match its trusted evidence.");
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
