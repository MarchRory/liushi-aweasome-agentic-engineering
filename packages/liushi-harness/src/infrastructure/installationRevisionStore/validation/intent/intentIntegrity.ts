import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  FileInstallAction,
  type InstallationRevisionEvent,
  type InstallationRevisionIntent,
} from "#domain/installation/index.js";
import { verifyInstallPlanIntegrity } from "#infrastructure/fileInstallPlanStore/validation/index.js";

import { corruptRevision } from "../errors/index.js";
import { eventSchema, intentSchema } from "../schemas/index.js";
import { verifyManifestProjection } from "./manifestProjectionChecks.js";
import { isSortedUniquePathSequence, hasOnlyTargetParentDirectories } from "./pathChecks.js";
import { verifyPreimages } from "./preimageChecks.js";

/** 严格校验尚未持久化的完整 Intent 及其所有派生数据。 */
export function verifyInstallationRevisionIntentIntegrity(
  input: unknown,
  digest: ContentDigestPort,
  platform: NodeJS.Platform = process.platform,
): Result<InstallationRevisionIntent, HarnessError> {
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) return corruptRevision("Installation Revision intent schema is invalid.");
  const verifiedPlan = verifyInstallPlanIntegrity(parsed.data.plan, digest, platform);
  if (verifiedPlan.status === ResultStatus.Failure) return verifiedPlan;
  const intent = {
    ...parsed.data,
    plan: verifiedPlan.value,
  } as unknown as InstallationRevisionIntent;

  if (intent.plan.files.some((file) => file.action === FileInstallAction.Conflict))
    return corruptRevision("Installation Revision cannot reserve a conflicting InstallPlan.");

  if (
    intent.approval.planId !== intent.plan.planId ||
    intent.approval.planDigest !== intent.plan.planDigest ||
    intent.approval.gate !== intent.plan.requiredGate
  )
    return corruptRevision("Installation approval is not bound to its exact InstallPlan.");

  const preimages = verifyPreimages(intent, digest, platform);
  if (preimages.status === ResultStatus.Failure) return preimages;
  const projection = verifyManifestProjection(intent, digest, platform);
  if (projection.status === ResultStatus.Failure) return projection;
  if (!isSortedUniquePathSequence(intent.createdDirectories, platform))
    return corruptRevision("Created directory paths must be unique and sorted.");
  if (!hasOnlyTargetParentDirectories(intent))
    return corruptRevision("Created directories must be parents of managed write targets.");
  return success(intent);
}

/** 校验调用方待追加事件的封闭 Schema；阶段顺序由 replay 判定。 */
export function validateInstallationRevisionEvent(
  input: unknown,
): Result<InstallationRevisionEvent, HarnessError> {
  const parsed = eventSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data as InstallationRevisionEvent)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Installation Revision event schema is invalid.",
        ),
      );
}
