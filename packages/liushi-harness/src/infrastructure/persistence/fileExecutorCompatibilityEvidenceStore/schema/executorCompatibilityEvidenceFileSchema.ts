import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
} from "#common/index.js";
import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  executorCapabilityEvidenceSchema,
  type ExecutorCapabilityEvidence,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

const jsonObjectSchema = z.record(z.string(), z.unknown());
const brandedExecutorCapabilityEvidenceSchema = executorCapabilityEvidenceSchema
  .refine((value) => value.schemaVersion === EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION)
  .transform((value): ExecutorCapabilityEvidence => ({
    ...value,
    scope: brandExecutorHostScope(value.scope),
    source: {
      ...value.source,
      artifactDigest: brandContentDigest(value.source.artifactDigest),
    },
    evidenceDigest: brandContentDigest(value.evidenceDigest),
  }));

/** 按指定错误类别严格解析规范 Evidence。 */
export function parseExecutorCompatibilityEvidence(
  value: unknown,
  errorCode: HarnessErrorCode,
): ExecutorCapabilityEvidence {
  const parsed = brandedExecutorCapabilityEvidenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new HarnessError(
      errorCode,
      "Executor Compatibility Evidence record Schema 无效。",
      {},
      parsed.error,
    );
  }
  return parsed.data;
}

/** 严格解析持久化的规范 Evidence Record。 */
export function parsePersistedExecutorCompatibilityEvidence(
  value: unknown,
): ExecutorCapabilityEvidence {
  return parseExecutorCompatibilityEvidence(value, HarnessErrorCode.CorruptStore);
}

/** 确认脱敏 Artifact 是可由 JSON 对象承载的记录。 */
export function parseExecutorCompatibilityArtifact(value: unknown): Record<string, unknown> {
  const parsed = jsonObjectSchema.safeParse(value);
  if (!parsed.success) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Executor Compatibility Artifact 必须是 JSON 对象。",
      {},
      parsed.error,
    );
  }
  return parsed.data;
}

/** 将已持久化 Artifact 的 Schema 失败分类为存储损坏。 */
export function parsePersistedExecutorCompatibilityArtifact(
  value: unknown,
): Record<string, unknown> {
  try {
    return parseExecutorCompatibilityArtifact(value);
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Executor Compatibility Artifact record 无效。",
      {},
      error,
    );
  }
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
