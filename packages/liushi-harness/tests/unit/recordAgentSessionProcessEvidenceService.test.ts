import { describe, expect, it } from "vitest";

import {
  AgentSessionProcessEvidenceCreateDisposition,
  CodingTaskSessionAdmissionStatus,
  HarnessError,
  HarnessErrorCode,
  RecordAgentSessionProcessEvidenceService,
  ResultStatus,
  failure,
  success,
  type AgentSessionProcessEvidence,
  type AgentSessionProcessEvidenceStore,
  type CodingTaskSessionActivationRepository,
  type CodingTaskSessionAdmissionStateStore,
  type RecordAgentSessionProcessEvidenceInput,
} from "../../src/index.js";
import { createCoverageFixture } from "../support/codingTaskSessionActionCoverage/index.js";

describe("RecordAgentSessionProcessEvidenceService", () => {
  it("真实 Agent 退出后在 waiting_agent 阶段记录证据，再交给 Closeout 消费", async () => {
    const harness = createHarness(CodingTaskSessionAdmissionStatus.WaitingAgent);

    const result = await harness.service.execute(harness.input);

    if (result.status === ResultStatus.Failure) throw result.error;
    expect(harness.createdEvidence).toHaveLength(1);
    expect(result.value).toMatchObject({
      workspaceId: harness.fixture.processEvidence.workspaceId,
      sessionId: harness.fixture.processEvidence.sessionId,
      codingTaskId: harness.fixture.activation.codingTaskId,
      sourceTaskId: harness.fixture.activation.sourceTaskId,
      activationBindingDigest: harness.fixture.activation.bindingDigest,
      executorSessionIdDigest: harness.input.claimedExecutorSessionIdDigest,
    });
  });

  it("拒绝在 Closing 后补录进程证据，避免 Closeout 与 Recorder 形成顺序竞态", async () => {
    const harness = createHarness(CodingTaskSessionAdmissionStatus.Closing);

    const result = await harness.service.execute(harness.input);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(harness.createdEvidence).toHaveLength(0);
  });
});

function createHarness(status: CodingTaskSessionAdmissionStatus) {
  const fixture = createCoverageFixture();
  const admission = { ...fixture.admission, status };
  const createdEvidence: AgentSessionProcessEvidence[] = [];
  const activationRepository: CodingTaskSessionActivationRepository = {
    create: () => Promise.reject(new Error("测试不允许创建 Activation。")),
    load: () => Promise.resolve(success(fixture.activation)),
  };
  const admissionStateStore: CodingTaskSessionAdmissionStateStore = {
    create: () => Promise.reject(new Error("测试不允许创建 Admission。")),
    load: () => Promise.resolve(success(admission)),
    replace: () => Promise.reject(new Error("测试不允许替换 Admission。")),
  };
  const evidenceStore: AgentSessionProcessEvidenceStore = {
    create: (evidence) => {
      createdEvidence.push(evidence);
      return Promise.resolve(
        success({
          disposition: AgentSessionProcessEvidenceCreateDisposition.Created,
          evidence,
        }),
      );
    },
    load: () =>
      Promise.resolve(
        failure(
          new HarnessError(
            HarnessErrorCode.PreconditionNotMet,
            "测试不允许在 Recorder 中加载进程证据。",
          ),
        ),
      ),
  };
  const service = new RecordAgentSessionProcessEvidenceService({
    activationRepository,
    admissionStateStore,
    evidenceStore,
    contentDigest: fixture.digest,
  });
  return {
    fixture,
    createdEvidence,
    service,
    input: createInput(fixture.processEvidence),
  };
}

function createInput(
  evidence: AgentSessionProcessEvidence,
): RecordAgentSessionProcessEvidenceInput {
  return {
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    claimedExecutorSessionIdDigest: evidence.executorSessionIdDigest,
    executorId: evidence.executorId,
    executorVersion: evidence.executorVersion,
    executableDigest: evidence.executableDigest,
    hostSurface: evidence.hostSurface,
    modelId: evidence.modelId,
    reasoningEffort: evidence.reasoningEffort,
    permissionMode: evidence.permissionMode,
    promptDigest: evidence.promptDigest,
    hookConfigDigest: evidence.hookConfigDigest,
    startedAt: evidence.startedAt,
    completedAt: evidence.completedAt,
    durationMs: evidence.durationMs,
    outcome: evidence.outcome,
    exitCode: evidence.exitCode,
    signal: evidence.signal,
    timedOut: evidence.timedOut,
  };
}
