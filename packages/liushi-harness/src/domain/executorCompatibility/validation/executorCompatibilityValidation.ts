import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";

import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  EXECUTOR_COMPATIBILITY_POLICY_SCHEMA_VERSION,
} from "../constants/index.js";
import type {
  CompileExecutorCompatibilityMatrixInput,
  ExecutorCapabilityEvidence,
} from "../contracts/index.js";
import { executorHostScopeIdentity, requirementIdentity } from "../digest/index.js";
import { ExecutorEvidenceLocatorKind } from "../enums/index.js";
import {
  executorCapabilityEvidenceSchema,
  executorCompatibilityPolicySchema,
  executorHostScopeSchema,
} from "../schemas/index.js";
import { hasDuplicateQualifiers, includesQualifiers } from "../utils/index.js";
import {
  validateExecutorCompatibilityPolicy,
  validateExecutorHostScopePairing,
} from "./executorPolicyValidation.js";

/** 校验 Matrix 编译输入的 Schema、Scope 和证据集合完整性。 */
export function validateExecutorCompatibilityInput(
  input: CompileExecutorCompatibilityMatrixInput,
): Result<void, HarnessError> {
  const scopeSchema = executorHostScopeSchema.safeParse(input.scope);
  if (!scopeSchema.success) return invalid("Executor host scope schema is invalid.");
  const scopePairing = validateExecutorHostScopePairing(input.scope);
  if (scopePairing.status === ResultStatus.Failure) return scopePairing;
  const policySchema = executorCompatibilityPolicySchema.safeParse(input.policy);
  if (!policySchema.success) return invalid("Executor compatibility policy schema is invalid.");
  if (input.policy.schemaVersion !== EXECUTOR_COMPATIBILITY_POLICY_SCHEMA_VERSION) {
    return invalid("Executor compatibility policy schema version is unsupported.");
  }

  const policy = validateExecutorCompatibilityPolicy(input.policy);
  if (policy.status === ResultStatus.Failure) return policy;

  const targetScope = executorHostScopeIdentity(input.scope);
  const evidenceFingerprints = new Set<string>();
  for (const evidence of input.evidence) {
    const evidenceCheck = validateEvidence(evidence, targetScope, input);
    if (evidenceCheck.status === ResultStatus.Failure) return evidenceCheck;

    const fingerprint = evidenceFingerprint(evidence);
    if (evidenceFingerprints.has(fingerprint)) {
      return invalid("Executor capability evidence contains a duplicate source record.");
    }
    evidenceFingerprints.add(fingerprint);
  }
  return success(undefined);
}

function validateEvidence(
  evidence: ExecutorCapabilityEvidence,
  targetScope: string,
  input: CompileExecutorCompatibilityMatrixInput,
): Result<void, HarnessError> {
  const parsed = executorCapabilityEvidenceSchema.safeParse(evidence);
  if (!parsed.success) return invalid("Executor capability evidence schema is invalid.");
  if (evidence.schemaVersion !== EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION) {
    return invalid("Executor capability evidence schema version is unsupported.");
  }
  if (executorHostScopeIdentity(evidence.scope) !== targetScope) {
    return invalid("Executor capability evidence scope does not match the target scope.");
  }
  if (hasDuplicateQualifiers(evidence.qualifiers)) {
    return invalid("Executor capability evidence contains duplicate qualifiers.");
  }
  if (new Set(evidence.source.checkIds).size !== evidence.source.checkIds.length) {
    return invalid("Executor capability evidence contains duplicate check identifiers.");
  }
  if (
    !isSafeEvidenceLocator(
      evidence.source.locator.kind,
      evidence.source.locator.value,
      evidence.source.artifactDigest,
    )
  ) {
    return invalid("Executor capability evidence locator is unsafe.");
  }
  if (!matchesAnyRequirement(evidence, input)) {
    return invalid("Executor capability evidence is outside the selected capability profile.");
  }
  return success(undefined);
}

function matchesAnyRequirement(
  evidence: ExecutorCapabilityEvidence,
  input: CompileExecutorCompatibilityMatrixInput,
): boolean {
  return input.policy.tiers.some((tier) =>
    tier.requirements.some(
      (requirement) =>
        requirement.capability === evidence.capability &&
        includesQualifiers(evidence.qualifiers, requirement.qualifiers) &&
        requirement.evidenceKinds.includes(evidence.kind),
    ),
  );
}

function evidenceFingerprint(evidence: ExecutorCapabilityEvidence): string {
  return [
    evidence.evidenceDigest,
    evidence.capability,
    evidence.kind,
    requirementIdentity(evidence),
  ].join("|");
}

function isSafeEvidenceLocator(
  kind: ExecutorEvidenceLocatorKind,
  value: string,
  artifactDigest: ContentDigest,
): boolean {
  if (
    kind === ExecutorEvidenceLocatorKind.RepositoryPath ||
    kind === ExecutorEvidenceLocatorKind.RuntimeStore
  ) {
    if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return false;
    if (!/^[A-Za-z0-9._@/-]+$/u.test(value)) return false;
    const segments = value.split("/");
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }
  return value === `urn:liushi:artifact:${artifactDigest}`;
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
