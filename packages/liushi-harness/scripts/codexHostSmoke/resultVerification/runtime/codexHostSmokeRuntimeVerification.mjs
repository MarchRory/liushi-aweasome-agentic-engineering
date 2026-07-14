import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { calculateDigest } from "../../../publicProjectSmoke/digest/index.mjs";
import { readCodexHostSmokeJsonFile } from "../../verification/index.mjs";
import { includesExactTextWithNormalizedLineEndings } from "../../verification/textEvidence/index.mjs";

const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const RESERVATION_FILE = "reservation.json";
const COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION = "1.0.0";
const HOOK_COMMAND_TYPES = ["hook.pre_action", "hook.post_action"];
const RESERVATION_REQUIRED_KEYS = [
  "aggregateId",
  "aggregateType",
  "commandId",
  "commandType",
  "idempotencyKey",
  "requestDigest",
  "schemaVersion",
  "submittedAt",
];
const RESERVATION_KEYS = [...RESERVATION_REQUIRED_KEYS, "invocationProvenance", "receipt"];
const RECEIPT_REQUIRED_KEYS = ["commandId", "requestDigest", "schemaVersion", "status"];
const RECEIPT_KEYS = [
  ...RECEIPT_REQUIRED_KEYS,
  "committedVersion",
  "duplicateOfCommandId",
  "errorCode",
  "errorMessage",
];
const COMMAND_STATUSES = new Set([
  "committed",
  "rejected",
  "conflict",
  "duplicate",
  "outcome_unknown",
]);
const COMMAND_ERROR_CODES = new Set([
  "invalid_envelope",
  "unsupported_schema_version",
  "invalid_command_id",
  "invalid_command_type",
  "invalid_aggregate_type",
  "invalid_aggregate_id",
  "invalid_expected_version",
  "invalid_idempotency_key",
  "invalid_request_digest",
  "invalid_actor",
  "invalid_authorization_context",
  "invalid_correlation_id",
  "invalid_causation_id",
  "invalid_submitted_at",
  "invalid_payload",
  "precondition_not_met",
  "authorization_denied",
  "resource_unavailable",
  "version_conflict",
  "idempotency_conflict",
  "outcome_unknown",
]);
const PROVENANCE_KEYS = [
  "executor",
  "inputDigest",
  "invocationId",
  "schemaVersion",
  "sessionIdDigest",
  "targetsDigest",
  "toolCallIdDigest",
  "toolName",
  "turnIdDigest",
];

export async function verifyCodexHostSmokeActivationEvidence(manifest, plan, candidateConfig) {
  const trustConfig = await readFile(plan.projectTrust.configFile, "utf8");
  if (
    !includesExactTextWithNormalizedLineEndings(trustConfig, plan.projectTrust.proposedToml.trim())
  ) {
    throw new Error("Host Smoke 精确项目 trust 不存在。");
  }
  const activeConfig = await readCodexHostSmokeJsonFile(
    manifest.paths.intendedHookConfigFile,
    "Active Hook Config",
  );
  if (
    calculateDigest(activeConfig) !== manifest.candidateHookConfig.digest ||
    !isDeepStrictEqual(activeConfig, candidateConfig)
  ) {
    throw new Error("已激活 Hook Config 与受审候选配置不一致。");
  }
  await assertBinding(manifest, plan);
}

export async function verifyCodexHostSmokeRuntimeEvidence(manifest, taskDirectory, scenarios) {
  const identity = manifest.bindingCandidate;
  const action = await verifyActionJournal(
    join(taskDirectory, "actions.jsonl"),
    scenarios.positive,
    identity,
  );
  const trace = await verifyTrace(join(taskDirectory, "traces.jsonl"), action.actionId, identity);
  await verifyCommandReceipts(manifest, action, trace, scenarios);
}

async function assertBinding(manifest, plan) {
  const bindingFile = join(manifest.paths.storeRoot, "hookBindings", "bindings.json");
  const document = await readCodexHostSmokeJsonFile(bindingFile, "Hook Binding");
  const bindings = document?.bindings;
  if (document?.schemaVersion !== "1.0.0" || !Array.isArray(bindings) || bindings.length !== 1) {
    throw new Error("Host Smoke Hook Binding 数量或 Schema 无效。");
  }
  const binding = bindings[0];
  if (
    binding?.schemaVersion !== "1.0.0" ||
    resolve(binding.workspaceRoot ?? "") !== resolve(manifest.paths.worktreeRoot) ||
    binding.workspaceId !== manifest.bindingCandidate.workspaceId ||
    binding.taskId !== manifest.bindingCandidate.taskId ||
    binding.planRiskArtifactId !== manifest.bindingCandidate.planRiskArtifactId ||
    binding.planRiskArtifactDigest !== manifest.bindingCandidate.planRiskArtifactDigest ||
    binding.actorId !== plan.actorId
  ) {
    throw new Error("Host Smoke Hook Binding 已漂移。");
  }
}

async function verifyActionJournal(path, positiveScenario, identity) {
  const envelopes = await readJsonLines(path, "Action Journal");
  if (envelopes.length !== 3) {
    throw new Error("Host Smoke Action Journal 必须且只能包含一个闭合 Action。");
  }
  let previousHash = "0".repeat(64);
  for (const [index, envelope] of envelopes.entries()) {
    const { hash, ...hashInput } = envelope ?? {};
    if (
      envelope?.schemaVersion !== "1.0.0" ||
      envelope.journalSequence !== index + 1 ||
      envelope.previousHash !== previousHash ||
      typeof hash !== "string" ||
      hash !== calculateDigest(hashInput).slice("sha256:".length)
    ) {
      throw new Error("Host Smoke Action Journal Hash Chain 无效。");
    }
    previousHash = hash;
  }
  const [intent, observation, resolutionRecord] = envelopes.map((envelope) => envelope.record);
  let targets;
  try {
    targets = JSON.parse(intent?.target ?? "");
  } catch {
    throw new Error("Host Smoke Action Intent target 不是有效 JSON。");
  }
  if (
    intent?.schemaVersion !== "1.0.0" ||
    intent.recordType !== "action_intent" ||
    intent.sequence !== 1 ||
    intent.workspaceId !== identity.workspaceId ||
    intent.taskId !== identity.taskId ||
    !isDeepStrictEqual(targets, [positiveScenario.target]) ||
    observation?.schemaVersion !== "1.0.0" ||
    observation.recordType !== "action_observation" ||
    observation.sequence !== 2 ||
    observation.workspaceId !== identity.workspaceId ||
    observation.taskId !== identity.taskId ||
    observation.actionId !== intent.actionId ||
    observation.outcome !== "succeeded" ||
    resolutionRecord?.schemaVersion !== "1.0.0" ||
    resolutionRecord.recordType !== "action_resolution" ||
    resolutionRecord.sequence !== 3 ||
    resolutionRecord.workspaceId !== identity.workspaceId ||
    resolutionRecord.taskId !== identity.taskId ||
    resolutionRecord.actionId !== intent.actionId ||
    resolutionRecord.resolution !== "committed"
  ) {
    throw new Error("Host Smoke 正向 Action Journal 未形成 succeeded/committed 闭环。");
  }
  return intent;
}

async function verifyTrace(path, actionId, identity) {
  const traces = await readJsonLines(path, "Trace");
  if (traces.length !== 1) throw new Error("Host Smoke 必须且只能产生一条正向 Trace。");
  const trace = traces[0];
  if (
    trace?.schemaVersion !== "1.0.0" ||
    trace.workspaceId !== identity.workspaceId ||
    trace.taskId !== identity.taskId ||
    trace.actionId !== actionId ||
    trace.operationKind !== "tool" ||
    trace.operationName !== "apply_patch" ||
    trace.status !== "ok" ||
    trace.tool?.toolName !== "apply_patch"
  ) {
    throw new Error("Host Smoke Trace 未绑定正向 apply_patch Action。");
  }
  return trace;
}

async function verifyCommandReceipts(manifest, action, trace, scenarios) {
  const reservationFiles = await collectReservationFiles(
    join(manifest.paths.storeRoot, "commandGateway"),
  );
  const reservations = await Promise.all(
    reservationFiles.map((path) => readCodexHostSmokeJsonFile(path, "Command Reservation")),
  );
  if (!reservations.every(isValidReservationStructure)) {
    throw new Error("Host Smoke Command Reservation 结构无效。");
  }
  const generatedAt = Date.parse(manifest.generatedAt);
  const hookReservations = reservations.filter(
    (record) =>
      Date.parse(record.submittedAt) >= generatedAt &&
      (HOOK_COMMAND_TYPES.includes(record.commandType) ||
        record?.invocationProvenance?.executor === "codex"),
  );
  if (!hookReservations.every(isValidHookReservation)) {
    throw new Error("Host Smoke 本轮 Hook Reservation provenance 无效。");
  }
  const positivePre = hookReservations.filter(
    (record) =>
      record.commandType === "hook.pre_action" &&
      record.aggregateId === action.actionId &&
      record.commandId === action.commandId &&
      record.receipt.status === "committed",
  );
  const positivePost = hookReservations.filter(
    (record) =>
      record.commandType === "hook.post_action" &&
      record.aggregateId === action.actionId &&
      record.commandId === trace.commandId &&
      record.receipt.status === "committed",
  );
  const negativePre = hookReservations.filter(
    (record) =>
      record.commandType === "hook.pre_action" &&
      record.aggregateId !== action.actionId &&
      record.receipt.status === "rejected" &&
      record.receipt.errorCode === "authorization_denied" &&
      record.receipt.errorMessage?.includes("目标超出 PlanRisk Write Set"),
  );
  if (positivePre.length !== 1 || positivePost.length !== 1 || negativePre.length !== 1) {
    throw new Error("Host Smoke Command Receipt 未证明一次正向闭环和一次 Write Set 拒绝。");
  }
  const positivePreProvenance = positivePre[0].invocationProvenance;
  const positivePostProvenance = positivePost[0].invocationProvenance;
  const negativePreProvenance = negativePre[0].invocationProvenance;
  if (
    !hasSameInvocation(positivePreProvenance, positivePostProvenance) ||
    positivePreProvenance.toolName !== "apply_patch" ||
    positivePreProvenance.targetsDigest !== calculateDigest([scenarios.positive.target]) ||
    trace.tool.toolCallId !== positivePreProvenance.toolCallIdDigest ||
    trace.tool.toolName !== positivePreProvenance.toolName ||
    calculateDigest(JSON.parse(action.target)) !== positivePreProvenance.targetsDigest ||
    action.inputDigest !== positivePreProvenance.inputDigest
  ) {
    throw new Error("Host Smoke 正向 Pre/Post、Trace 与 Action Intent provenance 不可拼接。");
  }
  if (
    negativePreProvenance.executor !== positivePreProvenance.executor ||
    negativePreProvenance.sessionIdDigest !== positivePreProvenance.sessionIdDigest ||
    negativePreProvenance.toolName !== "apply_patch" ||
    negativePreProvenance.targetsDigest !== calculateDigest([scenarios.negative.target]) ||
    negativePreProvenance.invocationId === positivePreProvenance.invocationId
  ) {
    throw new Error("Host Smoke 负向 Pre provenance 未绑定同 Session 的精确负向目标。");
  }
  if (
    reservations.some(
      (record) =>
        record.commandType === "hook.post_action" &&
        record.invocationProvenance?.invocationId === negativePreProvenance.invocationId,
    )
  ) {
    throw new Error("Host Smoke 负向 invocation 不允许存在 Post reservation。");
  }
  if (hookReservations.length !== 3) {
    throw new Error("Host Smoke 本轮必须且只能包含三条 Hook Reservation。");
  }
}

function isValidHookReservation(record) {
  return (
    isValidReservationStructure(record) &&
    record.aggregateType === "action" &&
    HOOK_COMMAND_TYPES.includes(record.commandType) &&
    record.receipt !== undefined &&
    hasValidCodexInvocationProvenance(record.invocationProvenance)
  );
}

function isValidReservationStructure(record) {
  return (
    isRecord(record) &&
    hasExactKeys(record, RESERVATION_REQUIRED_KEYS, RESERVATION_KEYS) &&
    record.schemaVersion === "1.0.0" &&
    [
      record.aggregateType,
      record.aggregateId,
      record.commandType,
      record.idempotencyKey,
      record.commandId,
    ].every(isNonBlankString) &&
    isContentDigest(record.requestDigest) &&
    isIsoDateTime(record.submittedAt) &&
    (record.invocationProvenance === undefined ||
      hasValidInvocationProvenanceShape(record.invocationProvenance)) &&
    (record.receipt === undefined || isValidReceipt(record.receipt, record))
  );
}

function isValidReceipt(receipt, reservation) {
  if (
    !isRecord(receipt) ||
    !hasExactKeys(receipt, RECEIPT_REQUIRED_KEYS, RECEIPT_KEYS) ||
    receipt.schemaVersion !== "1.0.0" ||
    !isNonBlankString(receipt.commandId) ||
    receipt.commandId !== reservation.commandId ||
    !isContentDigest(receipt.requestDigest) ||
    receipt.requestDigest !== reservation.requestDigest ||
    !COMMAND_STATUSES.has(receipt.status) ||
    (receipt.errorCode !== undefined && !COMMAND_ERROR_CODES.has(receipt.errorCode)) ||
    (receipt.errorMessage !== undefined &&
      (!isNonBlankString(receipt.errorMessage) || receipt.errorCode === undefined))
  ) {
    return false;
  }
  if (receipt.status === "committed") {
    return (
      Number.isInteger(receipt.committedVersion) &&
      receipt.committedVersion >= 0 &&
      receipt.errorCode === undefined &&
      receipt.errorMessage === undefined &&
      receipt.duplicateOfCommandId === undefined
    );
  }
  if (receipt.committedVersion !== undefined) return false;
  if (receipt.status === "duplicate") {
    return isNonBlankString(receipt.duplicateOfCommandId);
  }
  return receipt.duplicateOfCommandId === undefined && receipt.errorCode !== undefined;
}

function hasValidCodexInvocationProvenance(provenance) {
  return (
    hasValidInvocationProvenanceShape(provenance) &&
    provenance.executor === "codex" &&
    provenance.invocationId ===
      calculateDigest({
        executor: provenance.executor,
        sessionIdDigest: provenance.sessionIdDigest,
        turnIdDigest: provenance.turnIdDigest,
        toolCallIdDigest: provenance.toolCallIdDigest,
        toolName: provenance.toolName,
      })
  );
}

function hasValidInvocationProvenanceShape(provenance) {
  if (
    provenance?.schemaVersion !== COMMAND_INVOCATION_PROVENANCE_SCHEMA_VERSION ||
    !isNonBlankString(provenance.executor) ||
    !isNonBlankString(provenance.toolName) ||
    !isDeepStrictEqual(Object.keys(provenance).sort(), PROVENANCE_KEYS) ||
    ![
      provenance.invocationId,
      provenance.sessionIdDigest,
      provenance.turnIdDigest,
      provenance.toolCallIdDigest,
      provenance.targetsDigest,
      provenance.inputDigest,
    ].every(isContentDigest)
  ) {
    return false;
  }
  return true;
}

function hasSameInvocation(left, right) {
  return [
    "executor",
    "sessionIdDigest",
    "turnIdDigest",
    "toolCallIdDigest",
    "toolName",
    "invocationId",
    "targetsDigest",
    "inputDigest",
  ].every((field) => left[field] === right[field]);
}

function isContentDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function hasExactKeys(input, requiredKeys, allowedKeys) {
  const keys = Object.keys(input);
  return (
    requiredKeys.every((key) => Object.hasOwn(input, key)) &&
    keys.every((key) => allowedKeys.includes(key))
  );
}

function isNonBlankString(value) {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim() && !value.includes("\0")
  );
}

function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (match === null || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day &&
    normalized.getUTCHours() === hour &&
    normalized.getUTCMinutes() === minute &&
    normalized.getUTCSeconds() === second
  );
}

function isRecord(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

async function readJsonLines(path, label) {
  const realPath = await validateEvidenceFile(path, label);
  const content = await readFile(realPath, "utf8");
  if (!content.endsWith("\n")) throw new Error(`${label} 缺少完整行终止符。`);
  return content
    .split(/\r?\n/u)
    .slice(0, -1)
    .map((line) => {
      if (line.length === 0) throw new Error(`${label} 包含空记录。`);
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${label} 包含非法 JSON。`, { cause: error });
      }
    });
}

async function validateEvidenceFile(path, label) {
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size === 0 ||
    metadata.size > MAX_EVIDENCE_BYTES
  ) {
    throw new Error(`${label} 必须是非空且大小受限的普通文件。`);
  }
  return realpath(path);
}

async function collectReservationFiles(directory) {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Command Gateway Evidence Root 必须是普通目录。");
  }
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Command Gateway Evidence 不允许符号链接。");
    if (entry.isDirectory()) files.push(...(await collectReservationFiles(path)));
    else if (entry.isFile() && entry.name === RESERVATION_FILE) files.push(path);
  }
  return files.sort();
}
