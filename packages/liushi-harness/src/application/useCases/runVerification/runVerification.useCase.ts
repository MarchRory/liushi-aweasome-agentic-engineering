import type {
  ContentDigestPort,
  RunVerificationInput,
  VerificationExecutorPort,
  VerificationRunnerPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type Result,
} from "#common/index.js";
import {
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  EvidenceKind,
  VERIFICATION_EVIDENCE_SOURCE,
  VerificationFailureKind,
  VerificationRequirement,
  VerificationStatus,
  type EvidenceBundle,
  type VerificationCheck,
  type VerificationCheckEvidence,
  type VerificationExecutionResult,
  type VerificationExecutionStatus,
  type VerificationPlan,
  validateVerificationPlan,
} from "#domain/index.js";

/** 执行验证计划并装配不携带原始输出的 EvidenceBundle。 */
export class RunVerificationUseCase implements VerificationRunnerPort {
  public constructor(
    private readonly executor: VerificationExecutorPort,
    private readonly digest: ContentDigestPort,
    private readonly clock: Clock,
  ) {}

  /** 按 Check 声明顺序串行执行验证计划。 */
  public async execute(input: RunVerificationInput): Promise<Result<EvidenceBundle, HarnessError>> {
    const inputValidation = validateRunInput(input);
    if (inputValidation.status === ResultStatus.Failure) return inputValidation;

    const planResult = validateVerificationPlan(input.plan);
    if (planResult.status === ResultStatus.Failure) return planResult;
    const plan = planResult.value;

    const planDigest = this.digest.calculate(plan);
    if (planDigest.status === ResultStatus.Failure) return planDigest;

    const checks: VerificationCheckEvidence[] = [];
    for (const check of plan.checks) {
      const execution = await this.executeCheck(plan, check, input.worktreeRoot);
      const outputDigest = this.digest.calculate({
        stderr: execution.stderr ?? "",
        stdout: execution.stdout ?? "",
      });
      if (outputDigest.status === ResultStatus.Failure) return outputDigest;

      checks.push({
        checkId: check.checkId,
        kind: check.kind,
        requirement: check.requirement,
        status: execution.status,
        ...(execution.failureKind === undefined ? {} : { failureKind: execution.failureKind }),
        ...(execution.exitCode === undefined ? {} : { exitCode: execution.exitCode }),
        outputDigest: outputDigest.value,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        evidence: {
          evidenceId: `${input.verificationRunId}.${check.checkId}`,
          kind: EvidenceKind.Test,
          source: VERIFICATION_EVIDENCE_SOURCE,
          title: `Verification check ${check.checkId}`,
          locator: `${plan.planId}/${check.checkId}`,
          revision: plan.targetRevision,
          observedAt: execution.completedAt,
          contentDigest: outputDigest.value,
        },
      });
    }

    return success({
      schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
      verificationRunId: input.verificationRunId,
      planId: plan.planId,
      repositoryId: plan.repositoryId,
      worktreeId: plan.worktreeId,
      baseRevision: plan.baseRevision,
      targetRevision: plan.targetRevision,
      planDigest: planDigest.value,
      status: aggregateStatus(checks),
      generatedAt: this.clock.now().toISOString(),
      checks,
    });
  }

  /** 以 Port 形态暴露同一实现，便于 Studio 或 Workflow 调用。 */
  public async run(input: RunVerificationInput): Promise<Result<EvidenceBundle, HarnessError>> {
    return this.execute(input);
  }

  private async executeCheck(
    plan: VerificationPlan,
    check: VerificationCheck,
    worktreeRoot: string,
  ): Promise<VerificationExecutionResult> {
    const fallbackStartedAt = this.clock.now().toISOString();
    try {
      const result = await this.executor.execute({ plan, check, worktreeRoot });
      if (result.status === ResultStatus.Failure) {
        return blockedExecution(
          fallbackStartedAt,
          this.clock.now().toISOString(),
          VerificationFailureKind.Unavailable,
        );
      }

      const normalized = normalizeExecutionResult(result.value);
      if (normalized === undefined) {
        return blockedExecution(
          fallbackStartedAt,
          this.clock.now().toISOString(),
          VerificationFailureKind.InvalidOutput,
        );
      }
      return normalized;
    } catch {
      return blockedExecution(
        fallbackStartedAt,
        this.clock.now().toISOString(),
        VerificationFailureKind.Unavailable,
      );
    }
  }
}

function validateRunInput(input: RunVerificationInput): Result<true, HarnessError> {
  if (
    input === null ||
    typeof input !== "object" ||
    !isSafeIdentifier(input.verificationRunId) ||
    typeof input.worktreeRoot !== "string" ||
    !isAbsolutePath(input.worktreeRoot) ||
    input.worktreeRoot.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(input.worktreeRoot)
  ) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Verification run input is invalid.", {
        field: "input",
      }),
    );
  }
  return success(true);
}

function normalizeExecutionResult(
  result: VerificationExecutionResult,
): VerificationExecutionResult | undefined {
  if (!isExecutionStatus(result.status)) return undefined;
  if (!isIsoTimestamp(result.startedAt) || !isIsoTimestamp(result.completedAt)) return undefined;
  if (result.stdout !== undefined && typeof result.stdout !== "string") return undefined;
  if (result.stderr !== undefined && typeof result.stderr !== "string") return undefined;
  if (
    result.exitCode !== undefined &&
    result.exitCode !== null &&
    (typeof result.exitCode !== "number" || !Number.isInteger(result.exitCode))
  ) {
    return undefined;
  }
  if (result.failureKind !== undefined && !isFailureKind(result.failureKind)) return undefined;

  return {
    status: result.status,
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.failureKind === undefined ? {} : { failureKind: result.failureKind }),
    startedAt: result.startedAt,
    completedAt: result.completedAt,
  };
}

function blockedExecution(
  startedAt: string,
  completedAt: string,
  failureKind: VerificationFailureKind,
): VerificationExecutionResult {
  return {
    status: VerificationStatus.Blocked,
    failureKind,
    exitCode: null,
    stdout: "",
    stderr: "",
    startedAt,
    completedAt,
  };
}

function aggregateStatus(checks: readonly VerificationCheckEvidence[]): VerificationStatus {
  const blockingChecks = checks.filter(
    (check) => check.requirement !== VerificationRequirement.Advisory,
  );
  if (blockingChecks.some((check) => check.status === VerificationStatus.Failed)) {
    return VerificationStatus.Failed;
  }
  if (blockingChecks.some((check) => check.status === VerificationStatus.Blocked)) {
    return VerificationStatus.Blocked;
  }
  return VerificationStatus.Passed;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/u.test(value);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || /^[A-Za-z]:[\\/]/u.test(value);
}

function isExecutionStatus(value: unknown): value is VerificationExecutionStatus {
  return (
    value === VerificationStatus.Passed ||
    value === VerificationStatus.Failed ||
    value === VerificationStatus.Blocked
  );
}

function isFailureKind(value: unknown): value is VerificationFailureKind {
  return (
    typeof value === "string" &&
    Object.values(VerificationFailureKind).includes(value as VerificationFailureKind)
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
