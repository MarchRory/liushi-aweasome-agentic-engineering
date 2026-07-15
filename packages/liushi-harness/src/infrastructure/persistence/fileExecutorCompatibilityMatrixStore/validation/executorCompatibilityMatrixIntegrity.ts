import type { ExecutorCompatibilityMatrixRecord } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, type ContentDigest } from "#common/index.js";
import {
  createExecutorCompatibilityMatrixDigestInput,
  createExecutorCompatibilityPolicyDigestInput,
  type ExecutorCompatibilityDigestPort,
} from "#domain/executorCompatibility/index.js";

import { parseExecutorCompatibilityMatrixDigest } from "../path/index.js";
import { parseExecutorCompatibilityMatrixRecord } from "../schema/index.js";

/** 在写入前严格校验 Matrix Record 的 Schema 与两级摘要。 */
export function validateExecutorCompatibilityMatrixRecord(
  value: ExecutorCompatibilityMatrixRecord,
  digestPort: ExecutorCompatibilityDigestPort,
): ExecutorCompatibilityMatrixRecord {
  const parsed = parseExecutorCompatibilityMatrixRecord(value, HarnessErrorCode.InvalidInput);
  assertExecutorCompatibilityMatrixRecordIntegrity(
    parsed,
    parsed.matrix.matrixDigest,
    digestPort,
    HarnessErrorCode.InvalidInput,
  );
  return parsed;
}

/** 校验持久化 Matrix 的路径身份、Policy 摘要与 Matrix 摘要。 */
export function assertPersistedExecutorCompatibilityMatrixRecordIntegrity(
  record: ExecutorCompatibilityMatrixRecord,
  expectedDigest: ContentDigest,
  digestPort: ExecutorCompatibilityDigestPort,
): void {
  assertExecutorCompatibilityMatrixRecordIntegrity(
    record,
    expectedDigest,
    digestPort,
    HarnessErrorCode.CorruptStore,
  );
}

function assertExecutorCompatibilityMatrixRecordIntegrity(
  record: ExecutorCompatibilityMatrixRecord,
  expectedDigest: ContentDigest,
  digestPort: ExecutorCompatibilityDigestPort,
  errorCode: HarnessErrorCode,
): void {
  const matrixDigest = parseDigest(record.matrix.matrixDigest, errorCode, "matrix.matrixDigest");
  const policyDigest = parseDigest(record.matrix.policyDigest, errorCode, "matrix.policyDigest");
  if (matrixDigest !== expectedDigest) {
    throw new HarnessError(errorCode, "Matrix 文件身份与记录摘要不匹配。");
  }
  assertDigestMatches(
    digestPort,
    createExecutorCompatibilityPolicyDigestInput(record.policy),
    policyDigest,
    errorCode,
    "Executor Compatibility Policy 摘要不匹配。",
  );
  assertDigestMatches(
    digestPort,
    createExecutorCompatibilityMatrixDigestInput(record.matrix),
    matrixDigest,
    errorCode,
    "Executor Compatibility Matrix 摘要不匹配。",
  );
}

function parseDigest(value: string, errorCode: HarnessErrorCode, field: string): ContentDigest {
  try {
    return parseExecutorCompatibilityMatrixDigest(value);
  } catch (error) {
    throw new HarnessError(errorCode, "Executor Compatibility 摘要格式无效。", { field }, error);
  }
}

function assertDigestMatches(
  digestPort: ExecutorCompatibilityDigestPort,
  value: unknown,
  expectedDigest: ContentDigest,
  errorCode: HarnessErrorCode,
  message: string,
): void {
  const calculated = digestPort.calculate(value);
  if (calculated.status === ResultStatus.Failure) {
    throw new HarnessError(errorCode, message, {}, calculated.error);
  }
  if (calculated.value !== expectedDigest) throw new HarnessError(errorCode, message);
}
