import type {
  CodingTaskExecutionAuthorizationResolver,
  CodingTaskRepository,
  ContentDigestPort,
  EvidenceBundleStore,
  TaskRepository,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import type { PlanRiskArtifact } from "#domain/artifact/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";
import {
  DependencyAssessmentStatus,
  PR_READY_ARTIFACT_SCHEMA_VERSION,
  RepositoryDeliveryArtifactType,
  type PrReadyArtifact,
  type PrReadyArtifactBody,
  type PrReadyArtifactId,
} from "#domain/repositoryDelivery/index.js";
import {
  validateEvidenceBundle,
  VerificationStatus,
  type EvidenceBundle,
} from "#domain/verification/index.js";

import type { AssemblePrReadyArtifactInput } from "../contracts/index.js";
import {
  validateAssemblePrReadyArtifactInput,
  validateCompletedCodingTask,
  validatePrReadyAuthorizationArtifacts,
  validatePrReadyEvidence,
  type CompletedCodingTaskAttempt,
} from "../validation/index.js";

const DIGEST_PREFIX = "sha256:";

/** 从权威 CodingTask、来源 Task Artifact 与 Evidence 组装 PR-ready Artifact。 */
export class AssemblePrReadyArtifactUseCase {
  public constructor(
    private readonly codingTaskRepository: CodingTaskRepository,
    private readonly taskRepository: TaskRepository,
    private readonly authorizationResolver: CodingTaskExecutionAuthorizationResolver,
    private readonly evidenceBundleStore: EvidenceBundleStore,
    private readonly digestPort: ContentDigestPort,
  ) {}

  /** 仅在完成状态、验证绑定与 Human Gate Artifact 全部精确匹配时返回 Artifact。 */
  public async execute(
    input: AssemblePrReadyArtifactInput,
  ): Promise<Result<PrReadyArtifact, HarnessError>> {
    const validatedInput = validateAssemblePrReadyArtifactInput(input);
    if (validatedInput.status === ResultStatus.Failure) return validatedInput;
    const loadedCodingTask = await this.codingTaskRepository.load({
      workspaceId: validatedInput.value.workspaceId,
      codingTaskId: validatedInput.value.codingTaskId,
    });
    if (loadedCodingTask.status === ResultStatus.Failure) return loadedCodingTask;
    const aggregate = loadedCodingTask.value.aggregate;
    if (
      aggregate.workspaceId !== validatedInput.value.workspaceId ||
      aggregate.codingTaskId !== validatedInput.value.codingTaskId
    ) {
      return invalidInput("CodingTask Repository 返回了不匹配的输入身份。");
    }
    const attempt = validateCompletedCodingTask(aggregate);
    if (attempt.status === ResultStatus.Failure) return attempt;
    const loadedEvidence = await this.evidenceBundleStore.load(validatedInput.value);
    if (loadedEvidence.status === ResultStatus.Failure) return loadedEvidence;
    const validatedEvidence = validateEvidenceBundle(loadedEvidence.value);
    if (validatedEvidence.status === ResultStatus.Failure) return validatedEvidence;
    const evidence = validatePrReadyEvidence(
      validatedEvidence.value,
      validatedInput.value.verificationRunId,
      aggregate,
      attempt.value,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;
    const resolvedAuthorization = await this.authorizationResolver.resolve({
      sourceTaskId: aggregate.sourceTaskId,
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      writeSet: aggregate.writeSet,
      requested: aggregate.executionAuthorization,
    });
    if (resolvedAuthorization.status === ResultStatus.Failure) return resolvedAuthorization;

    const loadedTask = await this.taskRepository.load({
      workspaceId: aggregate.workspaceId,
      taskId: aggregate.sourceTaskId,
    });
    if (loadedTask.status === ResultStatus.Failure) return loadedTask;
    if (
      loadedTask.value.aggregate.task.workspaceId !== aggregate.workspaceId ||
      loadedTask.value.aggregate.task.taskId !== aggregate.sourceTaskId
    ) {
      return forbidden("CodingTask 的授权来源 Task 身份不匹配。");
    }
    const planRisk = validatePrReadyAuthorizationArtifacts(
      aggregate,
      loadedTask.value.aggregate.artifacts,
    );
    if (planRisk.status === ResultStatus.Failure) return planRisk;
    return this.assemble(aggregate, attempt.value, evidence.value, planRisk.value);
  }

  private assemble(
    aggregate: CodingTaskAggregate,
    attempt: CompletedCodingTaskAttempt,
    evidence: EvidenceBundle,
    planRisk: PlanRiskArtifact,
  ): Result<PrReadyArtifact, HarnessError> {
    const diffDigest = this.digestPort.calculate({
      baseRevision: aggregate.baseRevision,
      headRevision: attempt.targetRevision,
      changedPaths: attempt.changedPaths,
    });
    if (diffDigest.status === ResultStatus.Failure) return diffDigest;
    const evidenceBundleDigest = this.digestPort.calculate(evidence);
    if (evidenceBundleDigest.status === ResultStatus.Failure) return evidenceBundleDigest;
    const body: PrReadyArtifactBody = {
      schemaVersion: PR_READY_ARTIFACT_SCHEMA_VERSION,
      artifactType: RepositoryDeliveryArtifactType.PrReady,
      workspaceId: aggregate.workspaceId,
      repositoryId: aggregate.repositoryId,
      codingTaskId: aggregate.codingTaskId,
      sourceTaskId: aggregate.sourceTaskId,
      baseRevision: aggregate.baseRevision,
      headRevision: attempt.targetRevision,
      worktreeId: aggregate.worktreeBinding.worktreeId,
      branchName: aggregate.worktreeBinding.branchName,
      writeSet: aggregate.writeSet,
      changedPaths: attempt.changedPaths,
      diffDigest: diffDigest.value,
      inputBindingSet: aggregate.inputBindingSet,
      verification: {
        verificationRunId: evidence.verificationRunId,
        planId: evidence.planId,
        planDigest: evidence.planDigest,
        evidenceBundleDigest: evidenceBundleDigest.value,
        status: VerificationStatus.Passed,
      },
      authorization: aggregate.executionAuthorization,
      remainingRisks: planRisk.payload.risks,
      riskOperations: planRisk.payload.riskOperations,
      rollbackPlan: planRisk.payload.rollbackPlan,
      dependencyAssessment: {
        status: DependencyAssessmentStatus.NotAssessed,
        changes: [],
      },
      assembledAt: aggregate.updatedAt,
    };
    const artifactDigest = this.digestPort.calculate(body);
    if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;
    const artifactId: PrReadyArtifactId = `pr-ready:${artifactDigest.value.slice(
      DIGEST_PREFIX.length,
    )}`;
    return success({ artifactId, artifactDigest: artifactDigest.value, ...body });
  }
}

function invalidInput(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}

function forbidden(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message));
}
