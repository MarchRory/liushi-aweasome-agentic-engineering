import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  parseContentDigest,
  success,
  type Result,
} from "#common/index.js";
import { evidenceRefSchema } from "#domain/evidence/index.js";
import { parseRepositoryId } from "#domain/workspace/index.js";

import { EVIDENCE_BUNDLE_SCHEMA_VERSION } from "../constants/index.js";
import type { EvidenceBundle, VerificationCheckEvidence } from "../contracts/index.js";
import {
  VerificationFailureKind,
  VerificationKind,
  VerificationRequirement,
  VerificationStatus,
} from "../enums/index.js";

const contentDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const checkSchema = z
  .object({
    checkId: z.string(),
    kind: z.enum(VerificationKind),
    requirement: z.enum(VerificationRequirement),
    status: z.enum(VerificationStatus),
    failureKind: z.enum(VerificationFailureKind).optional(),
    exitCode: z.number().int().nullable().optional(),
    outputDigest: contentDigestSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    evidence: evidenceRefSchema,
  })
  .strict();

const bundleSchema = z
  .object({
    schemaVersion: z.literal(EVIDENCE_BUNDLE_SCHEMA_VERSION),
    verificationRunId: z.string(),
    planId: z.string(),
    repositoryId: z.string(),
    worktreeId: z.string(),
    baseRevision: z.string(),
    targetRevision: z.string(),
    planDigest: contentDigestSchema,
    status: z.enum(VerificationStatus),
    generatedAt: z.string().datetime(),
    checks: z.array(checkSchema).min(1),
  })
  .strict();

/** 严格校验从持久化边界读回的 EvidenceBundle 及其内部摘要绑定。 */
export function validateEvidenceBundle(input: unknown): Result<EvidenceBundle, HarnessError> {
  const parsed = bundleSchema.safeParse(input);
  if (!parsed.success) return failure(invalid());
  const data = parsed.data;
  const repositoryId = parseRepositoryId(data.repositoryId);
  if (repositoryId.status === ResultStatus.Failure) return repositoryId;
  const planDigest = parseContentDigest(data.planDigest);
  if (planDigest.status === ResultStatus.Failure) return planDigest;
  if (
    !isIdentifier(data.verificationRunId) ||
    !isIdentifier(data.planId) ||
    !isIdentifier(data.worktreeId) ||
    !isRevision(data.baseRevision) ||
    !isRevision(data.targetRevision)
  ) {
    return failure(invalid());
  }

  const checks: VerificationCheckEvidence[] = [];
  for (const check of data.checks) {
    const normalized = normalizeCheck(check, data.targetRevision);
    if (normalized.status === ResultStatus.Failure) return normalized;
    checks.push(normalized.value);
  }
  if (new Set(checks.map((check) => check.checkId)).size !== checks.length) {
    return failure(invalid());
  }
  if (
    !isSorted(checks.map((check) => check.checkId)) ||
    aggregateStatus(checks) !== data.status ||
    checks.some((check) => Date.parse(check.completedAt) > Date.parse(data.generatedAt))
  ) {
    return failure(invalid());
  }
  return success({
    ...data,
    repositoryId: repositoryId.value,
    planDigest: planDigest.value,
    checks,
  });
}

function normalizeCheck(
  check: z.infer<typeof checkSchema>,
  targetRevision: string,
): Result<VerificationCheckEvidence, HarnessError> {
  const outputDigest = parseContentDigest(check.outputDigest);
  if (outputDigest.status === ResultStatus.Failure) return outputDigest;
  if (
    !isIdentifier(check.checkId) ||
    check.evidence.contentDigest !== check.outputDigest ||
    check.evidence.revision !== targetRevision ||
    check.evidence.observedAt !== check.completedAt ||
    Date.parse(check.completedAt) < Date.parse(check.startedAt)
  ) {
    return failure(invalid());
  }
  const successful =
    check.status === VerificationStatus.Passed || check.status === VerificationStatus.Waived;
  if (
    (successful && check.failureKind !== undefined) ||
    (!successful && check.failureKind === undefined)
  ) {
    return failure(invalid());
  }
  return success({
    checkId: check.checkId,
    kind: check.kind,
    requirement: check.requirement,
    status: check.status,
    ...(check.failureKind === undefined ? {} : { failureKind: check.failureKind }),
    ...(check.exitCode === undefined ? {} : { exitCode: check.exitCode }),
    outputDigest: outputDigest.value,
    startedAt: check.startedAt,
    completedAt: check.completedAt,
    evidence: {
      evidenceId: check.evidence.evidenceId,
      kind: check.evidence.kind,
      source: check.evidence.source,
      title: check.evidence.title,
      ...(check.evidence.locator === undefined ? {} : { locator: check.evidence.locator }),
      revision: targetRevision,
      ...(check.evidence.observedAt === undefined ? {} : { observedAt: check.evidence.observedAt }),
      contentDigest: outputDigest.value,
    },
  });
}

function aggregateStatus(checks: readonly VerificationCheckEvidence[]): VerificationStatus {
  const blocking = checks.filter((check) => check.requirement !== VerificationRequirement.Advisory);
  if (blocking.some((check) => check.status === VerificationStatus.Failed)) {
    return VerificationStatus.Failed;
  }
  if (blocking.some((check) => check.status === VerificationStatus.Blocked)) {
    return VerificationStatus.Blocked;
  }
  return VerificationStatus.Passed;
}

function isSorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value);
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/u.test(value);
}

function isRevision(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !/\s/u.test(value) && !value.startsWith("-");
}

function invalid(): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "EvidenceBundle 无效。", {
    field: "evidenceBundle",
  });
}
