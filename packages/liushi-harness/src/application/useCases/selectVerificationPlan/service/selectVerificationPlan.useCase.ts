import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VerificationCheckSelectionStatus,
  VerificationImpactSelectionStatus,
  validateVerificationPlan,
  verificationImpactSelector,
  type ProjectVerificationCheck,
  type VerificationCheck,
} from "#domain/verification/index.js";

import type {
  SelectVerificationPlanInput,
  VerificationPlanSelectionResult,
  VerificationPlanSelectionSourceRefs,
} from "../contracts/index.js";
import { validateVerificationPlanSelectionContext } from "../validation/index.js";

/** 从 G8 Profile、CodingTask 与 Rule Bundle 生成确定性 Verification Plan。 */
export class SelectVerificationPlanUseCase {
  public constructor(private readonly digestPort: ContentDigestPort) {}

  /** 校验全部来源并生成 Ready Plan 或可解释的 Blocked 结果。 */
  public execute(
    input: SelectVerificationPlanInput,
  ): Result<VerificationPlanSelectionResult, HarnessError> {
    const context = validateVerificationPlanSelectionContext(input, this.digestPort);
    if (context.status === ResultStatus.Failure) return context;
    const selection = verificationImpactSelector({
      repositoryId: input.codingTask.repositoryId,
      changedPaths: context.value.attempt.changedPaths,
      checks: context.value.profile.verificationChecks,
      applicableRules: input.ruleBundle.rules,
      ruleTargets: input.ruleBundle.targets,
    });
    const sourceRefs: VerificationPlanSelectionSourceRefs = {
      projectProfileBundleDigest: input.profileBundle.digest,
      projectProfileDigest: context.value.profile.digest,
      proposalArtifactDigest: context.value.profile.sourceRefs.proposalArtifactDigest,
      profileApprovalId: context.value.profile.sourceRefs.approvalId,
      applicableRuleBundleDigest: input.ruleBundle.digest,
    };
    if (selection.status === VerificationImpactSelectionStatus.Blocked) {
      return success({ status: selection.status, selection, sourceRefs });
    }

    const plan = validateVerificationPlan({
      schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: input.planId,
      repositoryId: input.codingTask.repositoryId,
      worktreeId: input.codingTask.worktreeBinding.worktreeId,
      expectedBranchName: input.codingTask.worktreeBinding.branchName,
      baseRevision: input.codingTask.baseRevision,
      targetRevision: context.value.attempt.targetRevision,
      sourceRefs,
      checks: selection.checks
        .filter((check) => check.status === VerificationCheckSelectionStatus.Selected)
        .map((check) => toVerificationCheck(check.check)),
    });
    if (plan.status === ResultStatus.Failure) return plan;
    return success({ status: selection.status, selection, sourceRefs, plan: plan.value });
  }
}

function toVerificationCheck(check: ProjectVerificationCheck): VerificationCheck {
  return {
    checkId: check.checkId,
    kind: check.kind,
    requirement: check.requirement,
    command: check.command,
    timeoutMs: check.timeoutMs,
    retryable: check.retryable,
  };
}
