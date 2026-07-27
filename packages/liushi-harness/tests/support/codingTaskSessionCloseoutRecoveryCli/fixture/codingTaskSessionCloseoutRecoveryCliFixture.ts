import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
  CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE,
  CodingTaskSessionCloseoutRecoveryResolution,
  createCommandEnvelope,
} from "../../../../src/application/index.js";
import { ActorKind } from "../../../../src/common/index.js";
import { ResultStatus, parseContentDigest } from "../../../../src/common/index.js";
import type { ContentDigest } from "../../../../src/common/index.js";
import {
  rebuildCodingTaskSessionCloseoutState,
  type CodingTaskSessionCloseoutState,
} from "../../../../src/application/codingTaskSessionCloseoutState/index.js";
import { parseCodingTaskSessionId } from "../../../../src/domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "../../../../src/domain/workspace/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../../src/infrastructure/index.js";

import { digestCloseoutCliValue } from "../../codingTaskSessionCloseoutCli/index.js";
import type {
  CloseoutRecoveryAssessmentInput,
  CloseoutRecoveryCliSetup,
  CloseoutRecoveryHumanCommandFile,
  CloseoutRecoveryHumanCommandOptions,
} from "../contracts/index.js";

/** Recovery Human Command 使用的固定 Human Actor。 */
export const CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID = "human:closeout-recovery";

const closeoutStateDigest = new Rfc8785Sha256DigestAdapter();

/** 从 production assess 输出提取严格的 assessment 输入。 */
export function readCloseoutRecoveryAssessmentInput(
  data: Readonly<Record<string, unknown>>,
): CloseoutRecoveryAssessmentInput {
  const assessmentDigest = requireDigest(data["assessmentDigest"], "assessmentDigest");
  const closeoutVersion = data["closeoutVersion"];
  if (
    typeof closeoutVersion !== "number" ||
    !Number.isSafeInteger(closeoutVersion) ||
    closeoutVersion < 0
  ) {
    throw new Error("Assessment 缺少合法 closeoutVersion。");
  }
  const allowedResolution = readAllowedResolution(data["allowedResolution"]);
  return { assessmentDigest, closeoutVersion, allowedResolution };
}

/** 使用严格 Envelope 创建并写入 Human Recovery Command。 */
export async function writeCloseoutRecoveryHumanCommand(
  setup: CloseoutRecoveryCliSetup,
  data: Readonly<Record<string, unknown>>,
  options: CloseoutRecoveryHumanCommandOptions,
): Promise<CloseoutRecoveryHumanCommandFile> {
  const assessment = readCloseoutRecoveryAssessmentInput(data);
  if (options.resolution !== assessment.allowedResolution) {
    throw new Error("Human Resolution 与 Assessment 唯一允许值不一致。");
  }
  const workspaceId = parseWorkspaceId(setup.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
  const sessionId = parseCodingTaskSessionId(setup.sessionId);
  if (sessionId.status === ResultStatus.Failure) throw sessionId.error;
  const payload = {
    workspaceId: workspaceId.value,
    sessionId: sessionId.value,
    expectedAssessmentDigest: assessment.assessmentDigest,
    requestedResolution: options.resolution,
  };
  const created = createCommandEnvelope({
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: "closeout-recovery-human-command",
    commandType: CODING_TASK_SESSION_CLOSEOUT_RECOVERY_COMMAND_TYPE,
    aggregateType: CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
    aggregateId: setup.sessionId,
    expectedVersion: assessment.closeoutVersion,
    idempotencyKey: "closeout-recovery-human-command",
    requestDigest: digestCloseoutCliValue(payload),
    actor: { kind: ActorKind.Human, actorId: options.actorId },
    authorizationContext: {},
    correlationId: "closeout-recovery-human-correlation",
    causationId: "closeout-cli-command",
    submittedAt: "2026-07-27T00:00:00.000Z",
    payload,
  });
  if (created.status === ResultStatus.Failure) throw created.error;
  const filePath = join(setup.storeRoot, "closeoutRecoveryHumanCommand.json");
  await writeFile(filePath, JSON.stringify(created.value), "utf8");
  return { filePath, command: created.value };
}

/** 读取并确认 production Manager 写入的 Closeout State 是 JSON 对象。 */
export async function readPersistedCloseoutState(
  setup: CloseoutRecoveryCliSetup,
): Promise<CodingTaskSessionCloseoutState> {
  const parsed: unknown = JSON.parse(await readFile(setup.closeoutStateFile, "utf8"));
  const rebuilt = rebuildCodingTaskSessionCloseoutState(parsed, closeoutStateDigest);
  if (rebuilt.status === ResultStatus.Failure) throw rebuilt.error;
  return rebuilt.value;
}

function requireDigest(value: unknown, field: string): ContentDigest {
  if (typeof value !== "string") throw new Error(`Assessment 缺少 ${field}。`);
  const parsed = parseContentDigest(value);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function readAllowedResolution(value: unknown): CodingTaskSessionCloseoutRecoveryResolution {
  if (
    value !== CodingTaskSessionCloseoutRecoveryResolution.RetryOnce &&
    value !== CodingTaskSessionCloseoutRecoveryResolution.BindExisting
  ) {
    throw new Error("Assessment 缺少唯一允许的 Recovery Resolution。");
  }
  return value;
}
