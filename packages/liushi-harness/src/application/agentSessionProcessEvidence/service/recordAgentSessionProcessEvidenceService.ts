import { HarnessError, HarnessErrorCode, ResultStatus, failure } from "#common/index.js";
import {
  createAgentSessionProcessEvidence,
  AgentSessionProcessEvidenceSchemaVersion,
} from "#domain/agentSessionProcessEvidence/index.js";
import { CodingTaskSessionAdmissionStatus } from "#domain/codingTaskSession/index.js";
import { AgentSessionProcessEvidenceCreateDisposition } from "#application/ports/index.js";

import type {
  AgentSessionProcessEvidenceRecorderDependencies,
  RecordAgentSessionProcessEvidenceInput,
  RecordAgentSessionProcessEvidenceResult,
} from "../contracts/index.js";

/** 仅受信宿主可在真实 Agent 进程结束后调用的证据记录服务。 */
export class RecordAgentSessionProcessEvidenceService {
  public constructor(
    private readonly dependencies: AgentSessionProcessEvidenceRecorderDependencies,
  ) {}

  /** 从权威 Activation/Admission 注入身份并 create-only 持久化进程事实。 */
  public async execute(
    input: RecordAgentSessionProcessEvidenceInput,
  ): Promise<RecordAgentSessionProcessEvidenceResult> {
    const { claimedExecutorSessionIdDigest, ...processFacts } = input;
    const locator = { workspaceId: input.workspaceId, sessionId: input.sessionId };
    const activation = await this.dependencies.activationRepository.load(locator);
    if (activation.status === ResultStatus.Failure) return activation;
    const admission = await this.dependencies.admissionStateStore.load(locator);
    if (admission.status === ResultStatus.Failure) return admission;
    if (
      admission.value.workspaceId !== activation.value.workspaceId ||
      admission.value.sessionId !== activation.value.sessionId ||
      admission.value.activationBindingDigest !== activation.value.bindingDigest ||
      admission.value.status !== CodingTaskSessionAdmissionStatus.WaitingAgent ||
      admission.value.pendingAdmission !== null ||
      admission.value.claimedExecutorSessionIdDigest === null ||
      admission.value.claimedExecutorSessionIdDigest !== claimedExecutorSessionIdDigest
    ) {
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Admission 未处于可由真实 Agent 进程证据闭合的 waiting_agent 状态。",
        ),
      );
    }
    const evidence = createAgentSessionProcessEvidence(
      {
        ...processFacts,
        schemaVersion: AgentSessionProcessEvidenceSchemaVersion.V1,
        codingTaskId: activation.value.codingTaskId,
        sourceTaskId: activation.value.sourceTaskId,
        attemptNumber: activation.value.attemptNumber,
        worktreeId: activation.value.worktreeId,
        worktreeRootDigest: activation.value.worktreeRootDigest,
        activationBindingDigest: activation.value.bindingDigest,
        sessionBindingDigest: admission.value.sessionBindingDigest,
        executorSessionIdDigest: admission.value.claimedExecutorSessionIdDigest,
      },
      this.dependencies.contentDigest,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;
    const created = await this.dependencies.evidenceStore.create(evidence.value);
    if (created.status === ResultStatus.Failure) return created;
    return created.value.disposition === AgentSessionProcessEvidenceCreateDisposition.Conflict
      ? failure(
          new HarnessError(
            HarnessErrorCode.PreconditionNotMet,
            "同一 Session 的进程证据发生冲突。",
          ),
        )
      : { status: ResultStatus.Success, value: created.value.evidence };
  }
}
