import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { calculateDigest } from "../../../publicProjectSmoke/digest/index.mjs";
import { readCodexHostSmokeJsonFile } from "../../verification/index.mjs";

const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const RESERVATION_FILE = "reservation.json";

export async function verifyCodexHostSmokeActivationEvidence(manifest, plan, candidateConfig) {
  const trustConfig = await readFile(plan.projectTrust.configFile, "utf8");
  if (!trustConfig.includes(plan.projectTrust.proposedToml.trim())) {
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

export async function verifyCodexHostSmokeRuntimeEvidence(
  manifest,
  taskDirectory,
  positiveScenario,
) {
  const identity = manifest.bindingCandidate;
  const action = await verifyActionJournal(
    join(taskDirectory, "actions.jsonl"),
    positiveScenario,
    identity,
  );
  const trace = await verifyTrace(join(taskDirectory, "traces.jsonl"), action.actionId, identity);
  await verifyCommandReceipts(manifest, action, trace);
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

async function verifyCommandReceipts(manifest, action, trace) {
  const reservationFiles = await collectReservationFiles(
    join(manifest.paths.storeRoot, "commandGateway"),
  );
  const reservations = await Promise.all(
    reservationFiles.map((path) => readCodexHostSmokeJsonFile(path, "Command Reservation")),
  );
  const generatedAt = Date.parse(manifest.generatedAt);
  const hookReservations = reservations.filter(
    (record) =>
      isValidHookReservation(record) &&
      Number.isFinite(Date.parse(record.submittedAt)) &&
      Date.parse(record.submittedAt) >= generatedAt,
  );
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
  if (
    hookReservations.length !== 3 ||
    positivePre.length !== 1 ||
    positivePost.length !== 1 ||
    negativePre.length !== 1
  ) {
    throw new Error("Host Smoke Command Receipt 未证明一次正向闭环和一次 Write Set 拒绝。");
  }
}

function isValidHookReservation(record) {
  return (
    record?.schemaVersion === "1.0.0" &&
    record.aggregateType === "action" &&
    typeof record.aggregateId === "string" &&
    ["hook.pre_action", "hook.post_action"].includes(record.commandType) &&
    typeof record.idempotencyKey === "string" &&
    typeof record.commandId === "string" &&
    /^sha256:[a-f0-9]{64}$/u.test(record.requestDigest) &&
    typeof record.submittedAt === "string" &&
    record.receipt?.schemaVersion === "1.0.0" &&
    record.receipt?.commandId === record.commandId &&
    record.receipt.requestDigest === record.requestDigest &&
    hasValidReceiptResult(record.receipt)
  );
}

function hasValidReceiptResult(receipt) {
  return receipt.status === "committed"
    ? Number.isInteger(receipt.committedVersion) && receipt.committedVersion >= 0
    : typeof receipt.errorCode === "string" && receipt.committedVersion === undefined;
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
