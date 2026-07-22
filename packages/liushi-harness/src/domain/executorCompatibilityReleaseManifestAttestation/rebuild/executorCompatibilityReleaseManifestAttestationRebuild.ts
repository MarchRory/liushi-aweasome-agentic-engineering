import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import { sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue } from "../comparison/index.js";
import type {
  ExecutorCompatibilityReleaseManifestAttestationDigestPort,
  ExecutorCompatibilityReleaseManifestAttestationDraft,
} from "../contracts/index.js";
import { createExecutorCompatibilityReleaseManifestAttestationDraft } from "../factory/index.js";
import { executorCompatibilityReleaseManifestAttestationDraftSchema } from "../schemas/index.js";

/** 严格重建已持久化 Draft，并拒绝 unknown、字段漂移与摘要漂移。 */
export function rebuildExecutorCompatibilityReleaseManifestAttestationDraft(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseManifestAttestationDraft, HarnessError> {
  const parsed = executorCompatibilityReleaseManifestAttestationDraftSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Manifest Attestation Draft Schema 非法。"),
    );
  }
  const draftInput = parsed.data as unknown as ExecutorCompatibilityReleaseManifestAttestationDraft;
  const rebuilt = createExecutorCompatibilityReleaseManifestAttestationDraft(
    {
      manifest: draftInput.manifest,
      publisherIdentityPolicy: draftInput.publisherIdentityPolicy,
      decisionRequest: draftInput.decisionRequest,
      approvalRecord: draftInput.approvalRecord,
    },
    digestPort,
  );
  if (rebuilt.status === ResultStatus.Failure) return rebuilt;
  const equal = sameExecutorCompatibilityReleaseManifestAttestationCanonicalValue(
    draftInput,
    rebuilt.value,
    digestPort,
  );
  if (equal.status === ResultStatus.Failure) return equal;
  return equal.value
    ? success(rebuilt.value)
    : failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Manifest Attestation Draft 重建结果不一致。",
        ),
      );
}

/** 校验并重建 Manifest Attestation Draft 的公开入口。 */
export function validateExecutorCompatibilityReleaseManifestAttestationDraft(
  input: unknown,
  digestPort: ExecutorCompatibilityReleaseManifestAttestationDigestPort,
): Result<ExecutorCompatibilityReleaseManifestAttestationDraft, HarnessError> {
  return rebuildExecutorCompatibilityReleaseManifestAttestationDraft(input, digestPort);
}
