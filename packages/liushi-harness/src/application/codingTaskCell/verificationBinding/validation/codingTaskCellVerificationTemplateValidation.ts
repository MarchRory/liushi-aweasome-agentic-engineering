import { z } from "zod";

import type { ContentDigestPort } from "#application/ports/index.js";
import { parseRunVerificationPayload } from "#application/verificationCommand/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import type { CodingTaskCellVerificationTemplatePayload } from "../contracts/index.js";

const planTemplateSchema = z
  .object({
    schemaVersion: z.unknown(),
    planId: z.unknown(),
    repositoryId: z.unknown(),
    worktreeId: z.unknown(),
    expectedBranchName: z.unknown(),
    baseRevision: z.unknown(),
    sourceRefs: z.unknown(),
    checks: z.unknown(),
  })
  .strict();

const templatePayloadSchema = z
  .object({
    workspaceId: z.unknown(),
    actionId: z.unknown(),
    verificationRunId: z.unknown(),
    attemptNumber: z.unknown(),
    worktreeRootDigest: z.unknown(),
    plan: planTemplateSchema,
    failedVerificationTaxonomy: z.unknown(),
  })
  .strict();

/** 严格校验 Verification Template 及其模板摘要。 */
export function parseCodingTaskCellVerificationTemplate(
  input: unknown,
  requestDigest: ContentDigest,
  digest: ContentDigestPort,
): Result<CodingTaskCellVerificationTemplatePayload, HarnessError> {
  const parsed = templatePayloadSchema.safeParse(input);
  if (!parsed.success) return failure(invalidTemplate("payload"));

  // 仅借用既有完整 Plan 校验；临时 Revision 不会进入返回值或执行边界。
  const complete = parseRunVerificationPayload({
    ...parsed.data,
    plan: { ...parsed.data.plan, targetRevision: parsed.data.plan.baseRevision },
  });
  if (complete.status === ResultStatus.Failure) return complete;
  const template: CodingTaskCellVerificationTemplatePayload = {
    ...complete.value,
    plan: {
      schemaVersion: complete.value.plan.schemaVersion,
      planId: complete.value.plan.planId,
      repositoryId: complete.value.plan.repositoryId,
      worktreeId: complete.value.plan.worktreeId,
      expectedBranchName: complete.value.plan.expectedBranchName,
      baseRevision: complete.value.plan.baseRevision,
      sourceRefs: complete.value.plan.sourceRefs,
      checks: complete.value.plan.checks,
    },
  };
  const calculated = digest.calculate(template);
  if (calculated.status === ResultStatus.Failure) return calculated;
  return calculated.value === requestDigest
    ? success(template)
    : failure(invalidTemplate("requestDigest"));
}

function invalidTemplate(field: string): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "CodingTask Cell Verification Template 无效。",
    { field },
  );
}
