import { isDeepStrictEqual } from "node:util";

import {
  ActorKind,
  PilotAttestation,
  PilotExecutionMode,
  PilotMetricsCreateDisposition,
  PilotQualityFactKind,
  PilotStepOutcome,
  PilotStepPhase,
  ResultStatus,
  createPilotMetricsSettlement,
  rebuildPilotMetricsSettlement,
  success,
  validatePilotMetricsSettlementBinding,
} from "../../../dist/index.js";

import { GATES, PILOT_METRICS_FACTS_SCHEMA_VERSION } from "../constants/index.mjs";
import { calculateDigest } from "../digest/index.mjs";

const digestPort = Object.freeze({ calculate: (value) => success(calculateDigest(value)) });

export const PILOT_METRICS_EVIDENCE_SOURCE = Object.freeze({
  Requirement: "requirement",
  Plan: "plan",
  AgentExecution: "agent_execution",
  Checkpoint: "checkpoint",
  Verification: "verification",
  PrReady: "pr_ready",
});

/** 从 Human 原始事实和内部权威证据生成完整 Settlement Draft。 */
export function createCodexAgentPilotMetricsSettlementDraft(input) {
  const facts = normalizePilotMetricsFacts(input.facts);
  const evidence = createEvidenceIndex(input.sourceState);
  const plannedSteps = input.sourceState.metrics.enrollment.plannedSteps;
  const plannedById = new Map(plannedSteps.map((step) => [step.stepId, step]));
  const actualStepIds = new Set(facts.stepFacts.map((fact) => fact.stepId));
  if (
    actualStepIds.size !== facts.stepFacts.length ||
    actualStepIds.size !== plannedById.size ||
    [...plannedById.keys()].some((stepId) => !actualStepIds.has(stepId))
  ) {
    throw new Error("Metrics Facts 必须逐一覆盖全部预登记步骤。");
  }
  const body = {
    pilotId: input.sourceState.metrics.enrollment.pilotId,
    workspaceId: input.sourceState.task.workspaceId,
    sessionId: input.sourceState.activation.manifest.sessionId,
    codingTaskId: input.sourceState.activation.manifest.createCommand.aggregateId,
    repositoryId: input.sourceState.fixedProject.repositoryId,
    enrollmentDigest: input.sourceState.metrics.enrollment.recordDigest,
    verificationRunId: input.sourceState.completion.input.verification.verificationRunId,
    verificationActionId: input.sourceState.completion.input.verification.actionId,
    humanTouchEntries: facts.humanTouchEntries,
    stepFacts: facts.stepFacts.map((fact) => {
      const planned = plannedById.get(fact.stepId);
      if (planned === undefined) throw new Error(`未预登记 Metrics Step ${fact.stepId}。`);
      return {
        ...fact,
        evidenceDigests: resolveStepEvidence(planned.phase, evidence),
      };
    }),
    qualityFacts: facts.qualityFacts.map(({ evidenceSource, ...fact }) => ({
      ...fact,
      evidenceDigest: requireEvidence(evidence, evidenceSource),
    })),
    attestation: facts.attestation,
    settledAt: input.settledAt,
    actor: { kind: ActorKind.Human, actorId: input.actorId },
  };
  const created = createPilotMetricsSettlement(body, digestPort);
  if (created.status === ResultStatus.Failure) {
    throw new Error("Pilot Metrics Settlement Facts 无效。", { cause: created.error });
  }
  const binding = validatePilotMetricsSettlementBinding(
    input.sourceState.metrics.enrollment,
    created.value,
    false,
  );
  if (binding.status === ResultStatus.Failure) {
    throw new Error("Pilot Metrics Settlement 不符合预登记边界。", {
      cause: binding.error,
    });
  }
  const draft = globalThis.structuredClone(created.value);
  delete draft.schemaVersion;
  delete draft.recordDigest;
  return draft;
}

/** 复验持久化 Draft 与 Human Facts、Completion 和 Enrollment 的绑定。 */
export function validateCodexAgentPilotMetricsSettlementDraft(input, expected) {
  const rebuilt = createCodexAgentPilotMetricsSettlementDraft({
    ...expected,
    settledAt: input?.settledAt,
  });
  if (!isDeepStrictEqual(input, rebuilt)) {
    throw new Error("Pilot Metrics Settlement Draft 未绑定当前事实与状态。");
  }
  return globalThis.structuredClone(rebuilt);
}

/** 复验生产 Metrics CLI 返回的不可变 Settlement Record。 */
export function validateCodexAgentPilotMetricsSettlementEnvelope(envelope, draft) {
  if (envelope?.status !== "success") throw new Error("生产 Metrics CLI 未成功结算。");
  return validateCodexAgentPilotMetricsSettlementResult(envelope.data, draft);
}

/** 复验已持久化的生产 Settlement 结果，供首次写入与状态重放共用。 */
export function validateCodexAgentPilotMetricsSettlementResult(input, draft) {
  const result = requireRecord(input, "Pilot Metrics Settlement Result");
  if (!Object.values(PilotMetricsCreateDisposition).includes(result.disposition)) {
    throw new Error("生产 Metrics CLI 返回了无效 Settlement disposition。");
  }
  const record = rebuildPilotMetricsSettlement(result.record, digestPort);
  if (record.status === ResultStatus.Failure) {
    throw new Error("生产 Metrics CLI 返回了无效 Settlement Record。", {
      cause: record.error,
    });
  }
  const expected = createPilotMetricsSettlement(draft, digestPort);
  if (
    expected.status === ResultStatus.Failure ||
    !isDeepStrictEqual(record.value, expected.value)
  ) {
    throw new Error("生产 Metrics CLI 返回的 Settlement 与 Draft 不一致。");
  }
  return {
    disposition: result.disposition,
    record: globalThis.structuredClone(record.value),
  };
}

function normalizePilotMetricsFacts(input) {
  const record = requireRecord(input, "Metrics Facts");
  requireExactKeys(record, [
    "schemaVersion",
    "humanTouchEntries",
    "stepFacts",
    "qualityFacts",
    "attestation",
  ]);
  if (record.schemaVersion !== PILOT_METRICS_FACTS_SCHEMA_VERSION) {
    throw new Error(`Metrics Facts schemaVersion 必须是 ${PILOT_METRICS_FACTS_SCHEMA_VERSION}。`);
  }
  if (!Object.values(PilotAttestation).includes(record.attestation)) {
    throw new Error("Metrics Facts attestation 无效。");
  }
  return {
    humanTouchEntries: cloneArray(record.humanTouchEntries, "humanTouchEntries"),
    stepFacts: cloneArray(record.stepFacts, "stepFacts").map(normalizeStepFact),
    qualityFacts: cloneArray(record.qualityFacts, "qualityFacts").map(normalizeQualityFact),
    attestation: record.attestation,
  };
}

function normalizeStepFact(input, index) {
  const record = requireRecord(input, `stepFacts[${index}]`);
  requireExactKeys(record, ["stepId", "actualExecutionMode", "outcome", "attemptCount"]);
  if (!Object.values(PilotExecutionMode).includes(record.actualExecutionMode)) {
    throw new Error(`stepFacts[${index}].actualExecutionMode 无效。`);
  }
  if (!Object.values(PilotStepOutcome).includes(record.outcome)) {
    throw new Error(`stepFacts[${index}].outcome 无效。`);
  }
  if (!Number.isInteger(record.attemptCount) || record.attemptCount < 1) {
    throw new Error(`stepFacts[${index}].attemptCount 必须是正整数。`);
  }
  return {
    stepId: requireString(record.stepId, `stepFacts[${index}].stepId`),
    actualExecutionMode: record.actualExecutionMode,
    outcome: record.outcome,
    attemptCount: record.attemptCount,
  };
}

function normalizeQualityFact(input, index) {
  const record = requireRecord(input, `qualityFacts[${index}]`);
  const allowed = ["factId", "kind", "evidenceSource"];
  if (record.stepId !== undefined) allowed.push("stepId");
  requireExactKeys(record, allowed);
  if (!Object.values(PilotQualityFactKind).includes(record.kind)) {
    throw new Error(`qualityFacts[${index}].kind 无效。`);
  }
  if (!Object.values(PILOT_METRICS_EVIDENCE_SOURCE).includes(record.evidenceSource)) {
    throw new Error(`qualityFacts[${index}].evidenceSource 无效。`);
  }
  return {
    factId: requireString(record.factId, `qualityFacts[${index}].factId`),
    kind: record.kind,
    ...(record.stepId === undefined
      ? {}
      : { stepId: requireString(record.stepId, `qualityFacts[${index}].stepId`) }),
    evidenceSource: record.evidenceSource,
  };
}

function createEvidenceIndex(state) {
  const approvals = new Map(state.approvals.map((approval) => [approval.gate, approval]));
  return new Map([
    [PILOT_METRICS_EVIDENCE_SOURCE.Requirement, approvals.get(GATES.G1)?.artifactDigest],
    [PILOT_METRICS_EVIDENCE_SOURCE.Plan, approvals.get(GATES.G4)?.artifactDigest],
    [PILOT_METRICS_EVIDENCE_SOURCE.AgentExecution, state.agentExecution?.recordDigest],
    [
      PILOT_METRICS_EVIDENCE_SOURCE.Checkpoint,
      state.completion?.effectiveCloseout?.checkpoint?.bindingDigest,
    ],
    [
      PILOT_METRICS_EVIDENCE_SOURCE.Verification,
      calculateDigest(state.completion?.result?.evidenceBundle),
    ],
    [
      PILOT_METRICS_EVIDENCE_SOURCE.PrReady,
      state.completion?.result?.prReadyArtifact?.artifactDigest,
    ],
  ]);
}

function resolveStepEvidence(phase, evidence) {
  if (phase === PilotStepPhase.Plan) {
    return [
      requireEvidence(evidence, PILOT_METRICS_EVIDENCE_SOURCE.Requirement),
      requireEvidence(evidence, PILOT_METRICS_EVIDENCE_SOURCE.Plan),
    ];
  }
  if (phase === PilotStepPhase.Implement) {
    return [requireEvidence(evidence, PILOT_METRICS_EVIDENCE_SOURCE.AgentExecution)];
  }
  if (phase === PilotStepPhase.Verify) {
    return [requireEvidence(evidence, PILOT_METRICS_EVIDENCE_SOURCE.Verification)];
  }
  if (phase === PilotStepPhase.Review) {
    return [requireEvidence(evidence, PILOT_METRICS_EVIDENCE_SOURCE.PrReady)];
  }
  if (phase === PilotStepPhase.Recover) {
    return [requireEvidence(evidence, PILOT_METRICS_EVIDENCE_SOURCE.Checkpoint)];
  }
  throw new Error(`无法为 Metrics Phase ${phase} 绑定证据。`);
}

function requireEvidence(evidence, source) {
  const digest = evidence.get(source);
  if (typeof digest !== "string" || digest.length === 0) {
    throw new Error(`Metrics 证据 ${source} 缺失。`);
  }
  return digest;
}

function cloneArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`Metrics Facts ${label} 必须是数组。`);
  return globalThis.structuredClone(value);
}

function requireExactKeys(record, keys) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error("Metrics Facts 包含缺失或未授权字段。");
  }
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} 必须是非空字符串。`);
  }
  return value;
}
