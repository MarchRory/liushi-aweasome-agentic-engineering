import { z } from "zod";

import {
  CODING_TASK_AGGREGATE_TYPE,
  CodingTaskCommandType,
  type CodingTaskCommand,
} from "#application/codingTask/index.js";
import { parseCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";
import {
  WORKTREE_PROVISION_COMMAND_TYPE,
  type ProvisionWorktreeCommandPayload,
} from "#application/worktreeProvisioning/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseCodingTaskSessionId } from "#domain/codingTaskSession/index.js";

import {
  CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
  CODING_TASK_SESSION_ACTIVE_EXPECTED_VERSION,
  CODING_TASK_SESSION_CREATE_EXPECTED_VERSION,
} from "../constants/index.js";
import type { CodingTaskSessionActivationManifest } from "../contracts/index.js";
import { CodingTaskSessionActivationStage } from "../enums/index.js";

const manifestSchema = z
  .object({
    schemaVersion: z.literal(CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION),
    sessionId: z.string(),
    createCommand: z.unknown(),
    provision: z
      .object({
        command: z.unknown(),
        runtime: z.object({ repositoryRoot: z.string() }).strict(),
      })
      .strict(),
    startAttemptCommand: z.unknown(),
  })
  .strict();

/** 严格解析 Activation Manifest，并关闭命令身份与顺序歧义。 */
export function parseCodingTaskSessionActivationManifest(
  input: unknown,
): Result<CodingTaskSessionActivationManifest, HarnessError> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) return failure(invalidManifest("manifest"));
  const sessionId = parseCodingTaskSessionId(parsed.data.sessionId);
  if (sessionId.status === ResultStatus.Failure) return sessionId;

  const createCommand = parseExpectedCommand(
    parsed.data.createCommand,
    CodingTaskCommandType.Create,
    CODING_TASK_SESSION_CREATE_EXPECTED_VERSION,
    CodingTaskSessionActivationStage.Create,
  );
  if (createCommand.status === ResultStatus.Failure) return createCommand;
  const provisionCommand = parseExpectedCommand(
    parsed.data.provision.command,
    WORKTREE_PROVISION_COMMAND_TYPE,
    CODING_TASK_SESSION_ACTIVE_EXPECTED_VERSION,
    CodingTaskSessionActivationStage.Provision,
  );
  if (provisionCommand.status === ResultStatus.Failure) return provisionCommand;
  const startAttemptCommand = parseExpectedCommand(
    parsed.data.startAttemptCommand,
    CodingTaskCommandType.StartAttempt,
    CODING_TASK_SESSION_ACTIVE_EXPECTED_VERSION,
    CodingTaskSessionActivationStage.StartAttempt,
  );
  if (startAttemptCommand.status === ResultStatus.Failure) return startAttemptCommand;

  const identity = validateCommandIdentity([
    createCommand.value,
    provisionCommand.value,
    startAttemptCommand.value,
  ]);
  if (identity.status === ResultStatus.Failure) return identity;

  return success({
    schemaVersion: CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
    sessionId: sessionId.value,
    createCommand: createCommand.value as CodingTaskCommand<CodingTaskCommandType.Create>,
    provision: {
      command: provisionCommand.value as CommandEnvelope<ProvisionWorktreeCommandPayload>,
      runtime: parsed.data.provision.runtime,
    },
    startAttemptCommand:
      startAttemptCommand.value as CodingTaskCommand<CodingTaskCommandType.StartAttempt>,
  });
}

function parseExpectedCommand(
  input: unknown,
  expectedType: string,
  expectedVersion: number,
  stage: CodingTaskSessionActivationStage,
): Result<CommandEnvelope, HarnessError> {
  const command = parseCommandEnvelope(input);
  if (command.status === ResultStatus.Failure) return failure(withStage(command.error, stage));
  if (
    command.value.commandType !== expectedType ||
    command.value.aggregateType !== CODING_TASK_AGGREGATE_TYPE ||
    command.value.expectedVersion !== expectedVersion
  ) {
    return failure(
      invalidManifest("command", stage, {
        expectedType,
        expectedVersion: String(expectedVersion),
      }),
    );
  }
  return command;
}

function validateCommandIdentity(commands: readonly CommandEnvelope[]): Result<void, HarnessError> {
  const [first, ...rest] = commands;
  if (first === undefined) return failure(invalidManifest("commands"));
  const commandIds = new Set<string>();
  for (const command of commands) {
    if (
      command.aggregateId !== first.aggregateId ||
      command.correlationId !== first.correlationId ||
      commandIds.has(command.commandId)
    ) {
      return failure(invalidManifest("commandIdentity"));
    }
    commandIds.add(command.commandId);
  }
  if (rest.length !== 2) return failure(invalidManifest("commands"));
  return success(undefined);
}

function invalidManifest(
  field: string,
  stage?: CodingTaskSessionActivationStage,
  details: Readonly<Record<string, string>> = {},
): HarnessError {
  return new HarnessError(
    HarnessErrorCode.InvalidInput,
    "CodingTask Session Activation Manifest 无效。",
    { field, ...(stage === undefined ? {} : { stage }), ...details },
  );
}

function withStage(error: HarnessError, stage: CodingTaskSessionActivationStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}
