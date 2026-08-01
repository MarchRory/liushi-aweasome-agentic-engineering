import { isDeepStrictEqual } from "node:util";

import {
  PilotEnrollmentSchemaVersion,
  PilotMetricsCreateDisposition,
} from "../../../dist/index.js";
import { PILOT_METRICS_RISK_LEVEL_BY_PLAN_RISK } from "./pilotMetricsConstants.mjs";

const CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

/** 从已批准状态派生不可变的 Pilot Metrics Enrollment Draft。 */
export function createCodexAgentPilotMetricsEnrollmentDraft(input) {
  const project = requireRecord(input.fixedProject, "Fixed Project");
  const task = requireRecord(input.task, "Task");
  const manifest = requireRecord(input.manifest, "Session Activation Manifest");
  const createCommand = requireRecord(manifest.createCommand, "Create Command");
  const profileBundle = requireRecord(input.profile?.bundle, "ProjectProfile Bundle");
  const riskLevel =
    PILOT_METRICS_RISK_LEVEL_BY_PLAN_RISK[project.planRiskProposal?.payload?.riskLevel];
  if (riskLevel === undefined) throw new Error("PlanRisk riskLevel 无法映射到 Pilot Metrics。");
  return {
    pilotId: requireString(project.metrics?.pilotId, "Pilot ID"),
    workspaceId: requireString(task.workspaceId, "Workspace ID"),
    sessionId: requireString(manifest.sessionId, "Session ID"),
    codingTaskId: requireString(createCommand.aggregateId, "Coding Task ID"),
    repositoryId: requireString(project.repositoryId, "Repository ID"),
    taskClass: requireString(project.metrics?.taskClass, "Pilot Task Class"),
    riskLevel,
    historicalLogicChange: project.historicalLogicChange,
    plannedWritePathCount: requireArray(project.writeSet, "Write Set").length,
    requiredValidatorCount: countRequiredValidators(project.verificationChecks),
    repositoryRevision: requireString(project.revision, "Repository Revision"),
    harnessRevision: requireDigest(input.identities?.tarball?.digest, "Harness Revision"),
    policyDigest: requireDigest(profileBundle.digest, "Policy Digest"),
    plannedSteps: globalThis.structuredClone(
      requireArray(project.metrics?.plannedSteps, "Planned Steps"),
    ),
    enrolledAt: requireIsoTimestamp(input.enrolledAt, "Enrollment Time"),
    actor: { kind: "human", actorId: requireString(input.actorId, "Human Actor ID") },
  };
}

/** 校验 CLI 返回的记录与本次 Draft 完整一致。 */
export function validateCodexAgentPilotMetricsEnrollmentEnvelope(envelope, draft) {
  if (envelope?.status !== "success") throw new Error("Pilot Metrics Enrollment 未成功。");
  const data = requireRecord(envelope.data, "Pilot Metrics Enrollment Result");
  if (!isSuccessfulPilotMetricsEnrollmentDisposition(data.disposition)) {
    throw new Error("Pilot Metrics Enrollment disposition 无效。");
  }
  return {
    disposition: data.disposition,
    enrollment: validateCodexAgentPilotMetricsEnrollmentRecord(data.record, draft),
  };
}

/** 判断 CLI disposition 是否代表成功创建或幂等复用。 */
export function isSuccessfulPilotMetricsEnrollmentDisposition(value) {
  return (
    value === PilotMetricsCreateDisposition.Created ||
    value === PilotMetricsCreateDisposition.Reused
  );
}

/** 校验持久化 Enrollment 与预登记 Draft 的结构绑定。 */
export function validateCodexAgentPilotMetricsEnrollmentRecord(input, draft) {
  const record = requireRecord(input, "Pilot Metrics Enrollment");
  const { recordDigest, ...recordBody } = record;
  const expectedBody = {
    ...draft,
    schemaVersion: PilotEnrollmentSchemaVersion.V1,
  };
  if (!CONTENT_DIGEST_PATTERN.test(recordDigest) || !isDeepStrictEqual(recordBody, expectedBody)) {
    throw new Error("Pilot Metrics Enrollment 未完整绑定当前 Pilot 状态。");
  }
  return globalThis.structuredClone(record);
}

function countRequiredValidators(input) {
  const validators = new Set();
  for (const check of requireArray(input, "Verification Checks")) {
    if (check?.requirement !== "required") continue;
    for (const validatorId of requireArray(check.validatorIds, "Validator IDs")) {
      validators.add(requireString(validatorId, "Validator ID"));
    }
  }
  return validators.size;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} 缺失或无效。`);
  return value;
}

function requireDigest(value, label) {
  if (typeof value !== "string" || !CONTENT_DIGEST_PATTERN.test(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

function requireIsoTimestamp(value, label) {
  if (
    typeof value !== "string" ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} 缺失或无效。`);
  }
  return value;
}
