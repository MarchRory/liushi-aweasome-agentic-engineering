import { z } from "zod";

import type { ExecutorCompatibilityMatrixRecord } from "#application/ports/index.js";
import {
  HarnessError,
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
  type HarnessErrorCode,
} from "#common/index.js";
import {
  EXECUTOR_COMPATIBILITY_MATRIX_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_POLICY_SCHEMA_VERSION,
  executorCompatibilityMatrixSchema,
  executorCompatibilityPolicySchema,
  type ExecutorCompatibilityMatrix,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

const brandedExecutorCompatibilityMatrixSchema = executorCompatibilityMatrixSchema
  .refine((matrix) => matrix.schemaVersion === EXECUTOR_COMPATIBILITY_MATRIX_SCHEMA_VERSION)
  .transform((matrix): ExecutorCompatibilityMatrix => ({
    ...matrix,
    scope: brandExecutorHostScope(matrix.scope),
    policyDigest: brandContentDigest(matrix.policyDigest),
    capabilities: matrix.capabilities.map((capability) => ({
      ...capability,
      evidenceDigests: capability.evidenceDigests.map(brandContentDigest),
      requirements: capability.requirements.map((requirement) => ({
        ...requirement,
        evidenceKinds: requirement.evidenceKinds.map((assessment) => ({
          ...assessment,
          evidenceDigests: assessment.evidenceDigests.map(brandContentDigest),
        })),
      })),
    })),
    evidenceDigests: matrix.evidenceDigests.map(brandContentDigest),
    matrixDigest: brandContentDigest(matrix.matrixDigest),
  }));
const versionedExecutorCompatibilityPolicySchema = executorCompatibilityPolicySchema.refine(
  (policy) => policy.schemaVersion === EXECUTOR_COMPATIBILITY_POLICY_SCHEMA_VERSION,
);
const executorCompatibilityMatrixRecordSchema = z
  .object({
    matrix: brandedExecutorCompatibilityMatrixSchema,
    policy: versionedExecutorCompatibilityPolicySchema,
  })
  .strict();

/** 严格解析包含完整 Matrix 与 Policy 的不可变记录。 */
export function parseExecutorCompatibilityMatrixRecord(
  value: unknown,
  errorCode: HarnessErrorCode,
): ExecutorCompatibilityMatrixRecord {
  const parsed = executorCompatibilityMatrixRecordSchema.safeParse(value);
  if (!parsed.success) {
    throw new HarnessError(
      errorCode,
      "Executor Compatibility Matrix record Schema 无效。",
      {},
      parsed.error,
    );
  }
  return parsed.data;
}

function brandExecutorHostScope(value: {
  readonly adapterKind: ExecutorHostScope["adapterKind"];
  readonly distribution: ExecutorHostScope["distribution"];
  readonly adapterDigest: string;
  readonly executorVersion: string;
  readonly surface: ExecutorHostScope["surface"];
  readonly operatingSystem: ExecutorHostScope["operatingSystem"];
  readonly architecture: ExecutorHostScope["architecture"];
  readonly modelId?: string | undefined;
  readonly permissionMode?: ExecutorHostScope["permissionMode"] | undefined;
  readonly configurationDigest?: string | undefined;
}): ExecutorHostScope {
  return {
    adapterKind: value.adapterKind,
    distribution: value.distribution,
    adapterDigest: brandContentDigest(value.adapterDigest),
    executorVersion: value.executorVersion,
    surface: value.surface,
    operatingSystem: value.operatingSystem,
    architecture: value.architecture,
    ...(value.modelId === undefined ? {} : { modelId: value.modelId }),
    ...(value.permissionMode === undefined ? {} : { permissionMode: value.permissionMode }),
    ...(value.configurationDigest === undefined
      ? {}
      : { configurationDigest: brandContentDigest(value.configurationDigest) }),
  };
}

function brandContentDigest(value: string): ContentDigest {
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}
