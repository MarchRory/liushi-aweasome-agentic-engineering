import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import { buildExecutorCompatibilityMatrix } from "../calculation/index.js";
import type {
  CompileExecutorCompatibilityMatrixInput,
  ExecutorCompatibilityDigestPort,
  ExecutorCompatibilityMatrix,
} from "../contracts/index.js";
import {
  validateExecutorCapabilityEvidenceDigests,
  validateExecutorCompatibilityMatrix,
  validateExecutorCompatibilityInput,
} from "../validation/index.js";

/** 从显式 Policy 和精确 Scope Evidence 编译不可变支持矩阵。 */
export function compileExecutorCompatibilityMatrix(
  input: CompileExecutorCompatibilityMatrixInput,
  digestPort: ExecutorCompatibilityDigestPort,
): Result<ExecutorCompatibilityMatrix, HarnessError> {
  const validation = validateExecutorCompatibilityInput(input);
  if (validation.status === ResultStatus.Failure) return validation;
  const evidenceIntegrity = validateExecutorCapabilityEvidenceDigests(input.evidence, digestPort);
  if (evidenceIntegrity.status === ResultStatus.Failure) return evidenceIntegrity;
  const matrix = buildExecutorCompatibilityMatrix(
    input.scope,
    input.policy,
    input.evidence,
    digestPort,
  );
  if (matrix.status === ResultStatus.Failure) return matrix;
  const matrixValidation = validateExecutorCompatibilityMatrix(
    matrix.value,
    input.policy,
    input.evidence,
    digestPort,
  );
  return matrixValidation.status === ResultStatus.Failure ? matrixValidation : matrix;
}
