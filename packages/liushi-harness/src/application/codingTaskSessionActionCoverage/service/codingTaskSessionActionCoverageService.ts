import type { CodingTaskSessionActivationLocator } from "#application/ports/codingTaskSessionActivationRepository/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, failure } from "#common/index.js";
import { isCompletedAgentSessionProcessEvidence } from "#domain/agentSessionProcessEvidence/index.js";

import { CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CodingTaskSessionActionCoverageInput,
  CodingTaskSessionActionCoverageManifest,
  CodingTaskSessionActionCoverageManifestAction,
  CodingTaskSessionActionCoverageResult,
  CodingTaskSessionActionCoverageServiceDependencies,
} from "../contracts/index.js";
import { calculateCodingTaskSessionActionCoverageManifestDigest } from "../digest/index.js";
import {
  calculateAndMatchTraceDigests,
  validateActivationAndAdmission,
  validateCodingTaskSessionActionJournal,
} from "../validation/evidence/index.js";
import {
  rebuildCodingTaskSessionActionCoverageManifest,
  validateCodingTaskSessionActionCoverageInput,
} from "../validation/index.js";

/** 从 Activation、Admission、Journal 与 Trace 重建 Coverage Proof。 */
export class CodingTaskSessionActionCoverageService {
  public constructor(
    private readonly dependencies: CodingTaskSessionActionCoverageServiceDependencies,
  ) {}

  /** 执行一次严格的 Session Action/Trace Coverage Proof。 */
  public execute(
    input: CodingTaskSessionActionCoverageInput,
  ): Promise<CodingTaskSessionActionCoverageResult> {
    return this.create(input);
  }

  /** 仅按可信 Workspace/Session 定位并创建 canonical manifest。 */
  public async create(
    input: CodingTaskSessionActionCoverageInput,
  ): Promise<CodingTaskSessionActionCoverageResult> {
    const validatedInput = validateCodingTaskSessionActionCoverageInput(input);
    if (validatedInput.status === ResultStatus.Failure) return validatedInput;
    const locator: CodingTaskSessionActivationLocator = validatedInput.value;
    const activation = await this.dependencies.activationRepository.load(locator);
    if (activation.status === ResultStatus.Failure) return activation;
    const admission = await this.dependencies.admissionStateStore.load(locator);
    if (admission.status === ResultStatus.Failure) return admission;

    const actionIds = validateActivationAndAdmission(
      activation.value,
      admission.value,
      validatedInput.value,
    );
    if (actionIds.status === ResultStatus.Failure) return actionIds;
    const executorSessionIdDigest = admission.value.claimedExecutorSessionIdDigest;
    if (executorSessionIdDigest === null) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Admission 缺少执行器 Session 摘要。",
        ),
      );
    }
    const processEvidence = await this.dependencies.agentSessionProcessEvidenceStore.load(
      validatedInput.value,
    );
    if (processEvidence.status === ResultStatus.Failure) return processEvidence;
    if (
      !isCompletedAgentSessionProcessEvidence(processEvidence.value) ||
      processEvidence.value.workspaceId !== activation.value.workspaceId ||
      processEvidence.value.sessionId !== activation.value.sessionId ||
      processEvidence.value.codingTaskId !== activation.value.codingTaskId ||
      processEvidence.value.sourceTaskId !== activation.value.sourceTaskId ||
      processEvidence.value.attemptNumber !== activation.value.attemptNumber ||
      processEvidence.value.worktreeId !== activation.value.worktreeId ||
      processEvidence.value.worktreeRootDigest !== activation.value.worktreeRootDigest ||
      processEvidence.value.activationBindingDigest !== activation.value.bindingDigest ||
      processEvidence.value.sessionBindingDigest !== admission.value.sessionBindingDigest ||
      processEvidence.value.executorSessionIdDigest !== executorSessionIdDigest
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Agent 进程证据未完成或与权威 Session 身份不匹配。",
        ),
      );
    }

    const actions: CodingTaskSessionActionCoverageManifestAction[] = [];
    for (const actionId of actionIds.value) {
      const journal = await this.dependencies.actionJournalRepository.load({
        workspaceId: validatedInput.value.workspaceId,
        taskId: activation.value.sourceTaskId,
        actionId,
      });
      if (journal.status === ResultStatus.Failure) return journal;
      const journalEvidence = validateCodingTaskSessionActionJournal(
        journal.value,
        actionId,
        activation.value,
        admission.value,
        validatedInput.value,
      );
      if (journalEvidence.status === ResultStatus.Failure) return journalEvidence;

      const traces = await this.dependencies.traceObservationStore.query({
        workspaceId: validatedInput.value.workspaceId,
        taskId: activation.value.sourceTaskId,
        actionId,
      });
      if (traces.status === ResultStatus.Failure) return traces;
      const traceDigests = calculateAndMatchTraceDigests(
        traces.value,
        journalEvidence.value.observationDigests,
        actionId,
        validatedInput.value.workspaceId,
        activation.value.sourceTaskId,
        this.dependencies.contentDigest,
      );
      if (traceDigests.status === ResultStatus.Failure) return traceDigests;

      const journalDigest = this.dependencies.contentDigest.calculate(journal.value);
      if (journalDigest.status === ResultStatus.Failure) return journalDigest;
      actions.push({
        actionId,
        targets: journalEvidence.value.targets,
        journalDigest: journalDigest.value,
        traceObservationDigests: traceDigests.value,
      });
    }

    const manifestWithoutDigest = {
      schemaVersion: CODING_TASK_SESSION_ACTION_COVERAGE_MANIFEST_SCHEMA_VERSION,
      workspaceId: validatedInput.value.workspaceId,
      sessionId: validatedInput.value.sessionId,
      codingTaskId: activation.value.codingTaskId,
      sourceTaskId: activation.value.sourceTaskId,
      repositoryId: activation.value.repositoryId,
      attemptNumber: activation.value.attemptNumber,
      activationBindingDigest: activation.value.bindingDigest,
      sessionBindingDigest: admission.value.sessionBindingDigest,
      worktreeId: activation.value.worktreeId,
      worktreeRootDigest: activation.value.worktreeRootDigest,
      executorSessionIdDigest,
      agentProcessEvidenceDigest: processEvidence.value.evidenceDigest,
      actions,
    } satisfies Omit<CodingTaskSessionActionCoverageManifest, "manifestDigest">;
    const manifestDigest = calculateCodingTaskSessionActionCoverageManifestDigest(
      manifestWithoutDigest,
      this.dependencies.contentDigest,
    );
    if (manifestDigest.status === ResultStatus.Failure) return manifestDigest;
    return rebuildCodingTaskSessionActionCoverageManifest(
      { ...manifestWithoutDigest, manifestDigest: manifestDigest.value },
      this.dependencies.contentDigest,
    );
  }
}
