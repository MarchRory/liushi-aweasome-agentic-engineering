import type { ContentDigestPort } from "#application/ports/index.js";
import {
  CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION,
  PROJECT_PROFILE_SCHEMA_VERSION,
  RULE_BUNDLE_SCHEMA_VERSION,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import {
  CodingTaskAttemptOutcome,
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
  type CodingTaskAttempt,
} from "#domain/codingTask/index.js";
import {
  createProjectProfileBundleDigestInput,
  createProjectProfileDigestInput,
  type ProjectProfile,
} from "#domain/projectProfile/index.js";
import {
  RULE_RESOLVER_VERSION,
  RuleResolutionStatus,
  createApplicableRuleBundleDigestInput,
  parseProjectRuleCatalog,
} from "#domain/rule/index.js";
import { validateProjectVerificationChecks } from "#domain/verification/index.js";

import { validateRuleCatalogIntegrity } from "../../resolveRules/index.js";
import type { SelectVerificationPlanInput } from "../contracts/index.js";

/** 已证明身份、Revision 与摘要一致的 Plan 选择上下文。 */
export interface ValidatedVerificationPlanSelectionContext {
  /** 当前仓库经 G8 确认的 Profile。 */
  profile: ProjectProfile;
  /** 当前待验证或为幂等重放保留的最新实现尝试。 */
  attempt: CodingTaskAttempt & { targetRevision: string; changedPaths: readonly string[] };
}

/** 校验 Plan 选择所依赖的全部权威对象与交叉身份。 */
export function validateVerificationPlanSelectionContext(
  input: SelectVerificationPlanInput,
  digestPort: ContentDigestPort,
): Result<ValidatedVerificationPlanSelectionContext, HarnessError> {
  const currentVersions = validateCurrentSchemaVersions(input);
  if (currentVersions.status === ResultStatus.Failure) return currentVersions;

  const profile = findCurrentProfile(input);
  if (profile.status === ResultStatus.Failure) return profile;
  const checks = validateProjectVerificationChecks(profile.value.verificationChecks);
  if (checks.status === ResultStatus.Failure) return checks;

  const profileDigest = expectDigest(
    digestPort,
    createProjectProfileDigestInput(profile.value),
    profile.value.digest,
    "Project Profile Digest 不匹配。",
  );
  if (profileDigest.status === ResultStatus.Failure) return profileDigest;
  const parsedCatalog = parseProjectRuleCatalog(input.profileBundle.ruleCatalog);
  if (parsedCatalog.status === ResultStatus.Failure) return parsedCatalog;
  const catalog = validateRuleCatalogIntegrity(parsedCatalog.value, digestPort);
  if (catalog.status === ResultStatus.Failure) return catalog;
  const bundleDigest = expectDigest(
    digestPort,
    createProjectProfileBundleDigestInput(input.profileBundle),
    input.profileBundle.digest,
    "Project Profile Bundle Digest 不匹配。",
  );
  if (bundleDigest.status === ResultStatus.Failure) return bundleDigest;
  const ruleDigest = expectDigest(
    digestPort,
    createApplicableRuleBundleDigestInput(input.ruleBundle),
    input.ruleBundle.digest,
    "Applicable Rule Bundle Digest 不匹配。",
  );
  if (ruleDigest.status === ResultStatus.Failure) return ruleDigest;

  const identities = validateIdentities(input, profile.value);
  if (identities.status === ResultStatus.Failure) return identities;
  const ruleSources = validateRuleSources(input);
  if (ruleSources.status === ResultStatus.Failure) return ruleSources;
  const attempt = validateAttempt(input);
  if (attempt.status === ResultStatus.Failure) return attempt;
  return success({
    profile: { ...profile.value, verificationChecks: checks.value },
    attempt: attempt.value,
  });
}

function validateCurrentSchemaVersions(
  input: SelectVerificationPlanInput,
): Result<void, HarnessError> {
  if (
    input.profileBundle.schemaVersion !== PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION ||
    input.codingTask.schemaVersion !== CODING_TASK_AGGREGATE_SCHEMA_VERSION ||
    input.ruleBundle.schemaVersion !== RULE_BUNDLE_SCHEMA_VERSION ||
    input.ruleBundle.resolverVersion !== RULE_RESOLVER_VERSION
  ) {
    return invalid("Plan 选择输入包含不受支持的 Schema 或 Resolver 版本。");
  }
  if (input.ruleBundle.resolutionStatus !== RuleResolutionStatus.Ready) {
    return invalid("Applicable Rule Bundle 尚未达到 Ready 状态。", {
      resolutionStatus: input.ruleBundle.resolutionStatus,
    });
  }
  return success(undefined);
}

function findCurrentProfile(
  input: SelectVerificationPlanInput,
): Result<ProjectProfile, HarnessError> {
  const profileIds = input.profileBundle.profiles.map((profile) => profile.repositoryId);
  if (new Set(profileIds).size !== profileIds.length) {
    return invalid("Project Profile Bundle 包含重复仓库身份。");
  }
  const profiles = input.profileBundle.profiles.filter(
    (profile) => profile.repositoryId === input.codingTask.repositoryId,
  );
  if (profiles.length !== 1 || profiles[0]?.schemaVersion !== PROJECT_PROFILE_SCHEMA_VERSION) {
    return invalid("CodingTask 没有唯一且版本受支持的 Project Profile。", {
      repositoryId: input.codingTask.repositoryId,
    });
  }
  return success(profiles[0]);
}

function validateIdentities(
  input: SelectVerificationPlanInput,
  profile: ProjectProfile,
): Result<void, HarnessError> {
  if (
    input.profileBundle.workspaceId !== input.codingTask.workspaceId ||
    input.profileBundle.provenance.workspaceId !== input.profileBundle.workspaceId ||
    profile.workspaceId !== input.codingTask.workspaceId ||
    profile.workspaceGraphRevision !== input.profileBundle.workspaceGraphRevision ||
    profile.revision !== input.profileBundle.revision ||
    profile.repositoryRevision !== input.codingTask.baseRevision ||
    profile.sourceRefs.proposalArtifactDigest !==
      input.profileBundle.provenance.proposalArtifactDigest ||
    profile.sourceRefs.approvalId !== input.profileBundle.provenance.approvalId ||
    input.profileBundle.ruleCatalog.workspaceRef.workspaceId !== input.profileBundle.workspaceId ||
    input.profileBundle.ruleCatalog.workspaceRef.workspaceGraphRevision !==
      input.profileBundle.workspaceGraphRevision ||
    input.profileBundle.ruleCatalog.revision !== input.profileBundle.revision ||
    input.ruleBundle.taskId !== input.codingTask.sourceTaskId ||
    input.ruleBundle.workspaceRef.workspaceId !== input.codingTask.workspaceId ||
    input.ruleBundle.workspaceRef.workspaceGraphRevision !==
      input.profileBundle.workspaceGraphRevision
  ) {
    return invalid("Project Profile、Rule Bundle 与 CodingTask 身份或 Revision 不一致。");
  }
  const catalogRef = findRepositoryRef(
    input.profileBundle.ruleCatalog.repositoryRefs,
    input.codingTask.repositoryId,
  );
  const ruleRef = findRepositoryRef(input.ruleBundle.repositoryRefs, input.codingTask.repositoryId);
  if (
    catalogRef === undefined ||
    ruleRef === undefined ||
    catalogRef.repositoryRevision !== input.codingTask.baseRevision ||
    ruleRef.repositoryRevision !== input.codingTask.baseRevision ||
    catalogRef.projectProfileRevision !== profile.digest ||
    ruleRef.projectProfileRevision !== profile.digest
  ) {
    return invalid("Rule Context 未绑定当前 Repository 与 Project Profile Digest。");
  }
  return success(undefined);
}

function validateRuleSources(input: SelectVerificationPlanInput): Result<void, HarnessError> {
  const catalogRules = new Set(
    input.profileBundle.ruleCatalog.rules.map(
      (rule) => `${rule.ruleId}\u0000${rule.version}\u0000${rule.digest}`,
    ),
  );
  const unknown = input.ruleBundle.rules.find(
    (rule) => !catalogRules.has(`${rule.ruleId}\u0000${rule.version}\u0000${rule.ruleDigest}`),
  );
  return unknown === undefined
    ? success(undefined)
    : invalid("Applicable Rule 不属于当前 Project Profile Rule Catalog。", {
        ruleId: unknown.ruleId,
      });
}

function validateAttempt(
  input: SelectVerificationPlanInput,
): Result<ValidatedVerificationPlanSelectionContext["attempt"], HarnessError> {
  const attempt = input.codingTask.attempts.at(-1);
  const isPendingVerification =
    input.codingTask.phase === CodingTaskPhase.Verification &&
    input.codingTask.runState === CodingTaskRunState.Active &&
    attempt?.verificationOutcome === undefined;
  const isPassedReplay =
    input.codingTask.phase === CodingTaskPhase.Verification &&
    input.codingTask.runState === CodingTaskRunState.Completed &&
    attempt?.verificationOutcome === CodingTaskVerificationOutcome.Passed;
  const isFailedReplay =
    input.codingTask.phase === CodingTaskPhase.Implementation &&
    (input.codingTask.runState === CodingTaskRunState.Active ||
      input.codingTask.runState === CodingTaskRunState.WaitingHuman) &&
    attempt?.verificationOutcome === CodingTaskVerificationOutcome.Failed;
  if (
    (!isPendingVerification && !isPassedReplay && !isFailedReplay) ||
    !Number.isInteger(input.attemptNumber) ||
    input.attemptNumber <= 0 ||
    attempt?.number !== input.attemptNumber ||
    attempt.finishedAt === undefined ||
    attempt.outcome !== CodingTaskAttemptOutcome.Succeeded ||
    attempt.targetRevision === undefined ||
    attempt.changedPaths === undefined ||
    attempt.changedPaths.length === 0
  ) {
    return invalid("CodingTask 最新实现尝试尚未形成可验证的 Revision 与 Changed Paths。");
  }
  return success({
    ...attempt,
    targetRevision: attempt.targetRevision,
    changedPaths: attempt.changedPaths,
  });
}

function findRepositoryRef<T extends { repositoryId: string }>(
  refs: readonly T[],
  repositoryId: string,
): T | undefined {
  const matches = refs.filter((reference) => reference.repositoryId === repositoryId);
  return matches.length === 1 ? matches[0] : undefined;
}

function expectDigest(
  digestPort: ContentDigestPort,
  input: unknown,
  expected: string,
  message: string,
): Result<void, HarnessError> {
  const calculated = digestPort.calculate(input);
  if (calculated.status === ResultStatus.Failure) return calculated;
  return calculated.value === expected ? success(undefined) : invalid(message);
}

function invalid(
  message: string,
  details?: Readonly<Record<string, string>>,
): Result<never, HarnessError> {
  return {
    status: ResultStatus.Failure,
    error: new HarnessError(HarnessErrorCode.InvalidInput, message, details),
  };
}
