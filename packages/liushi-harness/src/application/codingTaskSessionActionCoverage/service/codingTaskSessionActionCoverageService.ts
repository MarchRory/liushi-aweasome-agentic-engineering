import type { CodingTaskSessionActivationLocator } from "#application/ports/codingTaskSessionActivationRepository/index.js";
import { ResultStatus } from "#common/index.js";

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

    const actions: CodingTaskSessionActionCoverageManifestAction[] = [];
    for (const actionId of actionIds.value) {
      const journal = await this.dependencies.actionJournalRepository.load({
        workspaceId: validatedInput.value.workspaceId,
        taskId: activation.value.sourceTaskId,
        actionId,
      });
      if (journal.status === ResultStatus.Failure) return journal;
      const journalDigests = validateCodingTaskSessionActionJournal(
        journal.value,
        actionId,
        activation.value,
        admission.value,
        validatedInput.value,
      );
      if (journalDigests.status === ResultStatus.Failure) return journalDigests;

      const traces = await this.dependencies.traceObservationStore.query({
        workspaceId: validatedInput.value.workspaceId,
        taskId: activation.value.sourceTaskId,
        actionId,
      });
      if (traces.status === ResultStatus.Failure) return traces;
      const traceDigests = calculateAndMatchTraceDigests(
        traces.value,
        journalDigests.value,
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
      executorSessionIdDigest: admission.value.claimedExecutorSessionIdDigest!,
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
