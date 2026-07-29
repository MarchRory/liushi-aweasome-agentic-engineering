import { CodingTaskDeliveryCompletionStatus } from "#application/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "#common/index.js";

import type {
  CliApplication,
  CodingTaskSessionCompleteCliCommand,
  RunCliDependencies,
} from "../../../contracts/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
} from "../../../constants/index.js";
import {
  mapErrorExitCode,
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../../../output/index.js";

/** 读取完整 Completion 输入，完成 CLI 绑定复验后调用既有 Application。 */
export async function executeCodingTaskSessionComplete(
  command: CodingTaskSessionCompleteCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const document = await dependencies.jsonDocumentReader.read(command.filePath);
  if (document.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, document.error);
    return mapErrorExitCode(document.error.code);
  }
  const bindingError = validateCompletionCliBinding(command, document.value);
  if (bindingError !== null) {
    writeFailure(dependencies, command.outputFormat, command.command, bindingError);
    return mapErrorExitCode(bindingError.code);
  }
  const result = await application.completeCodingTaskSessionDelivery.execute(document.value);
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  if (result.value.status === CodingTaskDeliveryCompletionStatus.ReviewReady) {
    writeSuccess(dependencies, command.outputFormat, command.command, result.value);
    return CLI_EXIT_CODE_SUCCESS;
  }
  writeBlocked(dependencies, command.outputFormat, command.command, result.value);
  return result.value.status === CodingTaskDeliveryCompletionStatus.OutcomeUnknown
    ? CLI_EXIT_CODE_OUTCOME_UNKNOWN
    : CLI_EXIT_CODE_CONFLICT;
}

function validateCompletionCliBinding(
  command: CodingTaskSessionCompleteCliCommand,
  document: unknown,
): HarnessError | null {
  if (!isRecord(document)) return null;
  const deliveryCommand = document["deliveryCommand"];
  if (!isRecord(deliveryCommand)) return null;
  const payload = deliveryCommand["payload"];
  if (isRecord(payload)) {
    if (
      typeof payload["workspaceId"] === "string" &&
      payload["workspaceId"] !== command.workspaceId
    ) {
      return bindingMismatch("Completion CLI Workspace 与 Delivery Command 不一致。");
    }
    if (typeof payload["sessionId"] === "string" && payload["sessionId"] !== command.sessionId) {
      return bindingMismatch("Completion CLI Session 与 Delivery Command 不一致。");
    }
  }
  const deliveryActor = deliveryCommand["actor"];
  if (isRecord(deliveryActor) && typeof deliveryActor["actorId"] === "string") {
    if (deliveryActor["actorId"] !== command.actorId) {
      return bindingMismatch("Completion CLI Actor 与 Delivery Command 不一致。");
    }
  }
  const verification = document["verification"];
  if (isRecord(verification)) {
    const verificationActor = verification["actor"];
    if (isRecord(verificationActor) && typeof verificationActor["actorId"] === "string") {
      if (verificationActor["actorId"] !== command.actorId) {
        return bindingMismatch("Completion CLI Actor 与 Verification 不一致。");
      }
    }
  }
  return null;
}

function bindingMismatch(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
