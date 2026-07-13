import { CODING_TASK_AGGREGATE_TYPE } from "#application/codingTask/index.js";
import type { CommandEnvelope } from "#application/command/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";

import { calculateImplementationSubmissionRuntimeDigest } from "../binding/index.js";
import { IMPLEMENTATION_SUBMIT_COMMAND_TYPE } from "../constants/index.js";
import type { ImplementationSubmissionRuntimeContext } from "../contracts/index.js";
import {
  parseSubmitImplementationPayload,
  type ValidatedSubmitImplementationPayload,
} from "./implementationSubmissionValidation.js";

/** 校验实现提交 Command、Payload Digest 与可信运行时绑定。 */
export function validateImplementationSubmissionEnvelope(
  digest: ContentDigestPort,
  command: CommandEnvelope,
  runtime: ImplementationSubmissionRuntimeContext,
): Result<ValidatedSubmitImplementationPayload, HarnessError> {
  if (
    command.commandType !== IMPLEMENTATION_SUBMIT_COMMAND_TYPE ||
    command.aggregateType !== CODING_TASK_AGGREGATE_TYPE
  ) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "实现提交命令作用域无效。"));
  }
  const payload = parseSubmitImplementationPayload(command.payload);
  if (payload.status === ResultStatus.Failure) return payload;
  const payloadDigest = digest.calculate(command.payload);
  if (payloadDigest.status === ResultStatus.Failure) return payloadDigest;
  if (payloadDigest.value !== command.requestDigest) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "实现提交 Payload Digest 不匹配。"),
    );
  }
  const runtimeDigest = calculateImplementationSubmissionRuntimeDigest(digest, runtime);
  if (runtimeDigest.status === ResultStatus.Failure) return runtimeDigest;
  return runtimeDigest.value === payload.value.repositoryRootDigest
    ? payload
    : failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "实现提交 Repository Root Digest 不匹配。"),
      );
}
