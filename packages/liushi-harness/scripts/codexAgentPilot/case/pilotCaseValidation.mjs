import { isAbsolute, posix, win32 } from "node:path";

import { parseArtifactProposal, validateProjectVerificationChecks } from "../../../dist/index.js";
import { PILOT_CASE_SCHEMA_VERSION, PILOT_CASE_SOURCE_KIND } from "../constants/index.mjs";
import {
  PILOT_CASE_GIT_REVISION_PATTERN,
  PILOT_CASE_PLAN_RISK_ARTIFACT_TYPE,
  PILOT_CASE_REQUIREMENT_ARTIFACT_TYPE,
  PILOT_CASE_RESULT_SUCCESS,
  PILOT_CASE_SAFE_IDENTIFIER_PATTERN,
} from "./pilotCaseConstants.mjs";
import { normalizePilotCaseMetrics } from "./pilotCaseMetricsValidation.mjs";

/** 校验并返回不依赖输入对象引用的 Pilot Case。 */
export function validateCodexAgentPilotCase(input) {
  const record = requireRecord(input, "Pilot Case");
  if (record.schemaVersion !== PILOT_CASE_SCHEMA_VERSION) {
    throw new Error(`Pilot Case schemaVersion 必须是 ${PILOT_CASE_SCHEMA_VERSION}。`);
  }
  if (record.sourceKind !== PILOT_CASE_SOURCE_KIND.LocalRepository) {
    throw new Error("外部 Pilot Case 只支持 local_repository。");
  }
  const workspaceId = requireIdentifier(record.workspaceId, "workspaceId");
  const taskSource = requireText(record.taskSource, "taskSource");
  const repository = normalizeRepository(record.repository);
  const writeSet = normalizeWriteSet(record.writeSet);
  if (record.historicalLogicChange !== false) {
    throw new Error("Pilot Case v1 只接受 historicalLogicChange=false 的低风险任务。");
  }
  const requirementProposal = parseProposal(
    record.requirementProposal,
    PILOT_CASE_REQUIREMENT_ARTIFACT_TYPE,
    "requirementProposal",
  );
  const planRiskProposal = parseProposal(
    record.planRiskProposal,
    PILOT_CASE_PLAN_RISK_ARTIFACT_TYPE,
    "planRiskProposal",
  );
  assertCaseConsistency({
    repository,
    writeSet,
    requirementProposal,
    planRiskProposal,
  });
  return {
    schemaVersion: PILOT_CASE_SCHEMA_VERSION,
    sourceKind: PILOT_CASE_SOURCE_KIND.LocalRepository,
    workspaceId,
    taskSource,
    repository,
    writeSet,
    historicalLogicChange: false,
    metrics: normalizePilotCaseMetrics(record.metrics),
    verificationChecks: normalizeVerificationChecks(record.verificationChecks),
    requirementProposal,
    planRiskProposal,
    agentInstruction: requireText(record.agentInstruction, "agentInstruction"),
  };
}

function normalizeRepository(input) {
  const record = requireRecord(input, "repository");
  const source = requireText(record.source, "repository.source");
  if (!isAbsolute(source)) throw new Error("repository.source 必须是本地绝对路径。");
  const revision = requireText(record.revision, "repository.revision");
  if (!PILOT_CASE_GIT_REVISION_PATTERN.test(revision)) {
    throw new Error("repository.revision 必须是完整小写 Git Revision。");
  }
  return {
    id: requireIdentifier(record.id, "repository.id"),
    source,
    revision,
    roleHint: requireText(record.roleHint, "repository.roleHint"),
    packageManager: requireText(record.packageManager, "repository.packageManager"),
  };
}

function normalizeWriteSet(input) {
  if (!Array.isArray(input) || input.length !== 1) {
    throw new Error("Pilot Case v1 的 writeSet 必须精确包含一个文件。");
  }
  const path = requireText(input[0], "writeSet[0]");
  if (
    path.includes("\\") ||
    posix.isAbsolute(path) ||
    win32.isAbsolute(path) ||
    path.includes(":") ||
    path === "." ||
    path === ".." ||
    path.startsWith("../") ||
    path.includes("/../") ||
    posix.normalize(path) !== path
  ) {
    throw new Error("writeSet 必须是规范化 POSIX 相对文件路径。");
  }
  return [path];
}

function normalizeVerificationChecks(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("verificationChecks 至少需要一个 Required Check。");
  }
  const checks = input.map((check, index) => {
    const record = requireRecord(check, `verificationChecks[${index}]`);
    const command = requireRecord(record.command, `verificationChecks[${index}].command`);
    return {
      checkId: requireIdentifier(record.checkId, `verificationChecks[${index}].checkId`),
      kind: requireText(record.kind, `verificationChecks[${index}].kind`),
      requirement: "required",
      command: {
        executable: requireText(
          command.executable,
          `verificationChecks[${index}].command.executable`,
        ),
        args: requireTextArray(command.args, `verificationChecks[${index}].command.args`),
        workingDirectory:
          command.workingDirectory === ""
            ? ""
            : requireText(
                command.workingDirectory,
                `verificationChecks[${index}].command.workingDirectory`,
              ),
        allowedEnvironmentKeys: requireTextArray(
          command.allowedEnvironmentKeys,
          `verificationChecks[${index}].command.allowedEnvironmentKeys`,
        ),
      },
      timeoutMs: requirePositiveInteger(record.timeoutMs, `verificationChecks[${index}].timeoutMs`),
      retryable: false,
      selectionMode: "always",
      validatorIds: requireTextArray(
        record.validatorIds,
        `verificationChecks[${index}].validatorIds`,
      ),
    };
  });
  const result = validateProjectVerificationChecks(checks);
  if (result.status !== PILOT_CASE_RESULT_SUCCESS) {
    throw new Error("verificationChecks 不符合 Harness Project Verification Check 契约。");
  }
  return result.value;
}

function parseProposal(input, artifactType, label) {
  const result = parseArtifactProposal(input);
  if (result.status !== PILOT_CASE_RESULT_SUCCESS || result.value.artifactType !== artifactType) {
    throw new Error(`${label} 不符合 Harness Artifact Proposal 契约。`);
  }
  return result.value;
}

function assertCaseConsistency(input) {
  const requirement = input.requirementProposal.payload;
  const plan = input.planRiskProposal.payload;
  if (
    JSON.stringify(requirement.includedScopes) !== JSON.stringify(input.writeSet) ||
    JSON.stringify(requirement.repositories) !== JSON.stringify([input.repository.id]) ||
    JSON.stringify(plan.writeSet) !== JSON.stringify(input.writeSet) ||
    plan.historicalLogicChange !== false ||
    plan.riskOperations.some((operation) => !input.writeSet.includes(operation.target))
  ) {
    throw new Error("Pilot Case 的 Repository、Requirement、PlanRisk 与 Write Set 不一致。");
  }
}

function requireIdentifier(value, label) {
  const text = requireText(value, label);
  if (!PILOT_CASE_SAFE_IDENTIFIER_PATTERN.test(text)) {
    throw new Error(`${label} 不是安全标识符。`);
  }
  return text;
}

function requireText(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes("\0")
  ) {
    throw new Error(`${label} 必须是非空字符串。`);
  }
  return value;
}

function requireTextArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是字符串数组。`);
  return value.map((entry, index) => requireText(entry, `${label}[${index}]`));
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} 必须是正整数。`);
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
  }
  return value;
}
