import {
  CodingTaskSessionActivationStatus,
  CodingTaskSessionCloseoutStatus,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
} from "../../constants/index.js";
import type {
  CliApplication,
  CodingTaskSessionActivateCliCommand,
  CodingTaskSessionCloseoutCliCommand,
  RunCliDependencies,
} from "../../contracts/index.js";
import { mapErrorExitCode, writeBlocked, writeFailure, writeSuccess } from "../../output/index.js";

/** 读取严格 Activation Manifest，并停在外部 Agent 启动边界。 */
export async function executeCodingTaskSessionActivate(
  command: CodingTaskSessionActivateCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const manifest = await dependencies.jsonDocumentReader.read(command.filePath);
  if (manifest.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, manifest.error);
    return mapErrorExitCode(manifest.error.code);
  }
  const result = await application.activateCodingTaskSession.execute(manifest.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.status === CodingTaskSessionActivationStatus.WaitingAgent) {
    writeSuccess(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_SUCCESS;
  }
  writeBlocked(dependencies, command.outputFormat, command.command, result.value);
  return result.value.status === CodingTaskSessionActivationStatus.OutcomeUnknown
    ? CLI_EXIT_CODE_OUTCOME_UNKNOWN
    : CLI_EXIT_CODE_CONFLICT;
}

/** 读取严格 Closeout Command，并把领域终态映射为稳定 CLI 结果。 */
export async function executeCodingTaskSessionCloseout(
  command: CodingTaskSessionCloseoutCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const bindingError = validateCloseoutCliBinding(command, document.value);
  if (bindingError !== null) {
    writeFailure(dependencies, command.outputFormat, command.command, bindingError);
    return mapErrorExitCode(bindingError.code);
  }
  const result = await application.closeoutCodingTaskSession.execute(document.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.status === CodingTaskSessionCloseoutStatus.CheckpointBound) {
    writeSuccess(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_SUCCESS;
  }
  writeBlocked(dependencies, command.outputFormat, command.command, result.value);
  return result.value.status === CodingTaskSessionCloseoutStatus.OutcomeUnknown
    ? CLI_EXIT_CODE_OUTCOME_UNKNOWN
    : CLI_EXIT_CODE_CONFLICT;
}

function validateCloseoutCliBinding(
  command: CodingTaskSessionCloseoutCliCommand,
  document: unknown,
): HarnessError | null {
  if (!isRecord(document)) return null;
  const actor = document["actor"];
  if (
    isRecord(actor) &&
    typeof actor["actorId"] === "string" &&
    actor["actorId"] !== command.actorId
  ) {
    return new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Closeout CLI Actor 与 Command Envelope Actor 不一致。",
    );
  }
  const payload = document["payload"];
  if (
    isRecord(payload) &&
    typeof payload["workspaceId"] === "string" &&
    payload["workspaceId"] !== command.workspaceId
  ) {
    return new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Closeout CLI Workspace 与 Command Envelope Workspace 不一致。",
    );
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
