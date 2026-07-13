import { z } from "zod";

import {
  CODING_TASK_AGGREGATE_TYPE,
  CodingTaskCommandType,
} from "#application/codingTask/index.js";
import { parseCommandEnvelope, type CommandEnvelope } from "#application/command/index.js";
import { IMPLEMENTATION_APPLY_COMMAND_TYPE } from "#application/implementationCommand/index.js";
import { IMPLEMENTATION_SUBMIT_COMMAND_TYPE } from "#application/implementationSubmission/index.js";
import { VERIFICATION_RUN_COMMAND_TYPE } from "#application/verificationCommand/index.js";
import { WORKTREE_PROVISION_COMMAND_TYPE } from "#application/worktreeProvisioning/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import {
  CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
  type CodingTaskCellRunManifest,
} from "../contracts/index.js";
import { CodingTaskCellStage } from "../enums/index.js";

const repositoryRuntimeSchema = z.object({ repositoryRoot: z.string() }).strict();
const worktreeRuntimeSchema = z.object({ worktreeRoot: z.string() }).strict();
const repositoryStepSchema = z
  .object({ command: z.unknown(), runtime: repositoryRuntimeSchema })
  .strict();
const verificationStepSchema = z
  .object({ command: z.unknown(), runtime: worktreeRuntimeSchema })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal(CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION),
    createCommand: z.unknown(),
    provision: repositoryStepSchema,
    startAttemptCommand: z.unknown(),
    implementations: z.array(repositoryStepSchema).min(1),
    submission: repositoryStepSchema,
    verification: verificationStepSchema,
  })
  .strict();

/** 严格解析 Cell Manifest，并只校验跨命令编排身份。 */
export function parseCodingTaskCellManifest(
  input: unknown,
): Result<CodingTaskCellRunManifest, HarnessError> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) return failure(invalidManifest("manifest"));

  const commands: Array<{
    readonly stage: CodingTaskCellStage;
    readonly expectedType: string;
    readonly input: unknown;
  }> = [
    {
      stage: CodingTaskCellStage.Create,
      expectedType: CodingTaskCommandType.Create,
      input: parsed.data.createCommand,
    },
    {
      stage: CodingTaskCellStage.Provision,
      expectedType: WORKTREE_PROVISION_COMMAND_TYPE,
      input: parsed.data.provision.command,
    },
    {
      stage: CodingTaskCellStage.StartAttempt,
      expectedType: CodingTaskCommandType.StartAttempt,
      input: parsed.data.startAttemptCommand,
    },
    ...parsed.data.implementations.map((step) => ({
      stage: CodingTaskCellStage.Implementation,
      expectedType: IMPLEMENTATION_APPLY_COMMAND_TYPE,
      input: step.command,
    })),
    {
      stage: CodingTaskCellStage.Submission,
      expectedType: IMPLEMENTATION_SUBMIT_COMMAND_TYPE,
      input: parsed.data.submission.command,
    },
    {
      stage: CodingTaskCellStage.Verification,
      expectedType: VERIFICATION_RUN_COMMAND_TYPE,
      input: parsed.data.verification.command,
    },
  ];
  const parsedCommands: CommandEnvelope[] = [];
  for (const entry of commands) {
    const command = parseCommandEnvelope(entry.input);
    if (command.status === ResultStatus.Failure)
      return failure(withStage(command.error, entry.stage));
    if (command.value.commandType !== entry.expectedType) {
      return failure(
        invalidManifest("commandType", entry.stage, {
          expected: entry.expectedType,
          actual: command.value.commandType,
        }),
      );
    }
    parsedCommands.push(command.value);
  }
  const identity = validateCommandIdentities(
    parsedCommands,
    commands.map(({ stage }) => stage),
  );
  if (identity.status === ResultStatus.Failure) return identity;
  let commandIndex = 0;
  return success({
    schemaVersion: CODING_TASK_CELL_MANIFEST_SCHEMA_VERSION,
    createCommand: parsedCommands[commandIndex++]!,
    provision: {
      command: parsedCommands[commandIndex++]!,
      runtime: parsed.data.provision.runtime,
    },
    startAttemptCommand: parsedCommands[commandIndex++]!,
    implementations: parsed.data.implementations.map((step) => ({
      command: parsedCommands[commandIndex++]!,
      runtime: step.runtime,
    })),
    submission: {
      command: parsedCommands[commandIndex++]!,
      runtime: parsed.data.submission.runtime,
    },
    verification: {
      command: parsedCommands[commandIndex]!,
      runtime: parsed.data.verification.runtime,
    },
  });
}

function validateCommandIdentities(
  commands: readonly CommandEnvelope[],
  stages: readonly CodingTaskCellStage[],
): Result<void, HarnessError> {
  const first = commands[0]!;
  const commandIds = new Set<string>();
  for (const [index, command] of commands.entries()) {
    const stage = stages[index]!;
    if (command.aggregateType !== CODING_TASK_AGGREGATE_TYPE) {
      return failure(invalidManifest("aggregateType", stage));
    }
    if (command.aggregateId !== first.aggregateId) {
      return failure(invalidManifest("aggregateId", stage));
    }
    if (command.correlationId !== first.correlationId) {
      return failure(invalidManifest("correlationId", stage));
    }
    if (commandIds.has(command.commandId)) {
      return failure(invalidManifest("commandId", stage, { commandId: command.commandId }));
    }
    commandIds.add(command.commandId);
  }
  return success(undefined);
}

function invalidManifest(
  field: string,
  stage?: CodingTaskCellStage,
  details: Readonly<Record<string, string>> = {},
): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, "CodingTask Cell Manifest 无效。", {
    field,
    ...(stage === undefined ? {} : { stage }),
    ...details,
  });
}

function withStage(error: HarnessError, stage: CodingTaskCellStage): HarnessError {
  return new HarnessError(error.code, error.message, { ...error.details, stage }, error.cause);
}
