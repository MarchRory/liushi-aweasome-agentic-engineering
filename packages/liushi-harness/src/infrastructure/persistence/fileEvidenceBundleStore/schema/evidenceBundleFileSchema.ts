import { z } from "zod";

import { ResultStatus, parseContentDigest } from "#common/index.js";
import { validateEvidenceBundle } from "#domain/verification/index.js";

import { EVIDENCE_BUNDLE_FILE_SCHEMA_VERSION } from "../constants/index.js";
import type { PersistedEvidenceBundle } from "../contracts/index.js";

const fileSchema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_BUNDLE_FILE_SCHEMA_VERSION),
    workspaceId: z.string(),
    codingTaskId: z.string(),
    verificationRunId: z.string(),
    bundleDigest: z.string(),
    bundle: z.unknown(),
  })
  .strict();

/** 严格解析 EvidenceBundle 文件并恢复带品牌的摘要与领域对象。 */
export function parsePersistedEvidenceBundle(input: unknown): PersistedEvidenceBundle {
  const parsed = fileSchema.parse(input);
  const bundleDigest = parseContentDigest(parsed.bundleDigest);
  if (bundleDigest.status === ResultStatus.Failure) throw bundleDigest.error;
  const bundle = validateEvidenceBundle(parsed.bundle);
  if (bundle.status === ResultStatus.Failure) throw bundle.error;
  return { ...parsed, bundleDigest: bundleDigest.value, bundle: bundle.value };
}
