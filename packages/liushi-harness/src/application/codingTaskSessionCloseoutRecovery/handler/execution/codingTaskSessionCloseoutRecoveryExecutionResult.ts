import type { CommandHandlerSuccess } from "#application/commandGateway/index.js";
import {
  CodingTaskSessionCloseoutRecoveryStateStatus,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../state/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { terminalRecoveryError } from "../errors/index.js";

/** 投影初始授权三元组不匹配的稳定冲突。 */
export function authorizationDrift(): Result<never, HarnessError> {
  return failure(
    new HarnessError(
      HarnessErrorCode.VersionConflict,
      "Human Recovery Command 与 fresh Assessment 不一致。",
    ),
  );
}

/** 判断 Recovery State 是否不可再自动推进。 */
export function isTerminalRecoveryState(state: CodingTaskSessionCloseoutRecoveryState): boolean {
  return ![
    CodingTaskSessionCloseoutRecoveryStateStatus.Approved,
    CodingTaskSessionCloseoutRecoveryStateStatus.Executing,
  ].includes(state.status);
}

/** 将四个 Recovery 终态投影为 Handler 成功或稳定失败。 */
export function projectTerminal(
  state: CodingTaskSessionCloseoutRecoveryState,
): Result<CommandHandlerSuccess, HarnessError> {
  if (state.status === CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound) {
    return success({ committedVersion: state.version });
  }
  return failure(
    terminalRecoveryError(
      state.errorCode ?? HarnessErrorCode.PreconditionNotMet,
      "Closeout Recovery 已处于不可自动推进的终态。",
    ),
  );
}
