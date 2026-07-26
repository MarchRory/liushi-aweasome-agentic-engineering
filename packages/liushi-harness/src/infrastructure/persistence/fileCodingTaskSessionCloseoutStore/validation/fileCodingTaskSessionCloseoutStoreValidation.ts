import {
  CodingTaskSessionCloseoutStatus,
  type CodingTaskSessionCloseoutState,
} from "#application/codingTaskSessionCloseoutState/index.js";
import type { CodingTaskSessionCloseoutStateLocator } from "#application/ports/codingTaskSessionCloseoutStateStore/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  parseCodingTaskSessionId,
  type CodingTaskSessionId,
} from "#domain/codingTaskSession/index.js";
import { parseWorkspaceId, type WorkspaceId } from "#domain/workspace/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

/** 严格解析 Closeout State 定位信息。 */
export function parseCloseoutStateLocator(
  locator: CodingTaskSessionCloseoutStateLocator,
): Result<
  { readonly workspaceId: WorkspaceId; readonly sessionId: CodingTaskSessionId },
  HarnessError
> {
  if (typeof locator?.workspaceId !== "string" || typeof locator?.sessionId !== "string") {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Closeout State locator 无效。"),
    );
  }
  const workspaceId = parseWorkspaceId(locator.workspaceId);
  if (workspaceId.status === ResultStatus.Failure) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "workspaceId 无效。"));
  }
  const sessionId = parseCodingTaskSessionId(locator.sessionId);
  if (sessionId.status === ResultStatus.Failure) {
    return failure(new HarnessError(HarnessErrorCode.InvalidInput, "sessionId 无效。"));
  }
  return success({ workspaceId: workspaceId.value, sessionId: sessionId.value });
}

/** 判断 State 是否为唯一允许 create 的初始 Closing。 */
export function isInitialCloseoutState(state: CodingTaskSessionCloseoutState): boolean {
  return (
    state.status === CodingTaskSessionCloseoutStatus.Closing &&
    state.version === 0 &&
    state.snapshot === null &&
    state.coveredActionIds.length === 0 &&
    state.actionEvidenceDigest === null &&
    state.checkpoint === null &&
    state.stoppedStage === null &&
    state.errorCode === null &&
    state.recoveryGuidance === null
  );
}

/** 比较完整 State 的规范 JSON 内容。 */
export function hasSameCanonicalCloseoutState(
  left: CodingTaskSessionCloseoutState,
  right: CodingTaskSessionCloseoutState,
): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}
