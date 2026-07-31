import type {
  CodexAppServerThreadStatusTransition,
  CodexAppServerWireRecord,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS } from "../constants/index.js";
import {
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
  CODEX_APP_SERVER_REMOTE_CONTROL_STATUS,
  CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS,
  CODEX_APP_SERVER_THREAD_STATUS,
  CODEX_APP_SERVER_TURN_STATUSES,
} from "../enums/index.js";
import { CodexAppServerApprovalState } from "../enums/index.js";
import {
  assertContext,
  assertTurnLifecycleStarted,
  createProtocolError,
  hasExactKeys,
  isRpcId,
  readTurnId,
  readTurnStatus,
  requireIdentifier,
  requireRecord,
} from "./protocolWire.js";
import type { CodexAppServerProtocolContext } from "./protocolState.js";

/** 处理 turn/completed 通知并收口 Turn 结果。 */
export function handleTurnCompleted(
  context: CodexAppServerProtocolContext,
  params: CodexAppServerWireRecord,
): void {
  assertTurnLifecycleStarted(context, "turn/completed");
  const threadId = requireIdentifier(params.threadId, "turn/completed threadId");
  const turnId = readTurnId(params);
  const normalizedTurnId = requireIdentifier(turnId, "turn/completed turnId");
  assertContext(context, threadId, normalizedTurnId, "turn/completed");
  if (context.state.turnCompleted) throw createProtocolError("turn/completed was repeated");
  const status = readTurnStatus(params);
  if (status === CODEX_APP_SERVER_TURN_STATUSES.InProgress) {
    throw createProtocolError("turn/completed cannot be in progress");
  }

  context.state.turnCompleted = true;
  if (status === CODEX_APP_SERVER_TURN_STATUSES.Completed) {
    assertSuccessfulFileChanges(context);
    context.state.outcome = CODEX_APP_SERVER_OUTCOMES.Succeeded;
  } else if (status === CODEX_APP_SERVER_TURN_STATUSES.Interrupted) {
    context.state.outcome = CODEX_APP_SERVER_OUTCOMES.Interrupted;
  } else if (status === CODEX_APP_SERVER_TURN_STATUSES.Failed) {
    context.state.outcome = CODEX_APP_SERVER_OUTCOMES.Failed;
  } else {
    throw createProtocolError("turn/completed status is invalid");
  }
  context.state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.Completed;
  context.io.closeInput();
}

/** 处理 serverRequest/resolved 通知并确认对应审批响应。 */
export function handleServerRequestResolved(
  context: CodexAppServerProtocolContext,
  params: CodexAppServerWireRecord,
): void {
  assertTurnLifecycleStarted(context, "serverRequest/resolved");
  const requestId = params.requestId;
  if (!isRpcId(requestId) || !context.state.respondedServerRequestIds.has(requestId)) {
    throw createProtocolError("serverRequest/resolved did not match an approval response");
  }
  if (context.state.resolvedServerRequestIds.has(requestId)) {
    throw createProtocolError("serverRequest/resolved was repeated");
  }
  context.state.resolvedServerRequestIds.add(requestId);
}

/** 处理远程控制状态并强制保持禁用。 */
export function handleRemoteControlStatusChanged(params: CodexAppServerWireRecord): void {
  if (
    params.status !== CODEX_APP_SERVER_REMOTE_CONTROL_STATUS.Disabled ||
    typeof params.serverName !== "string" ||
    params.serverName.length === 0 ||
    typeof params.installationId !== "string" ||
    params.installationId.length === 0 ||
    params.environmentId !== null
  ) {
    throw createProtocolError("remote control must remain disabled");
  }
}

/** 处理线程状态变化并验证固定四段序列。 */
export function handleThreadStatusChanged(
  context: CodexAppServerProtocolContext,
  params: CodexAppServerWireRecord,
): void {
  if (context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.Running) {
    throw createProtocolError("thread/status/changed arrived outside a running turn");
  }
  const threadId = requireIdentifier(params.threadId, "thread/status/changed threadId");
  if (context.state.threadId === null || threadId !== context.state.threadId) {
    throw createProtocolError("thread/status/changed thread identity did not match");
  }
  const transition = normalizeThreadStatusTransition(
    requireRecord(params.status, "thread/status/changed status"),
  );
  assertRequiredThreadStatusTransition(context, transition);
  if (transition.type === CODEX_APP_SERVER_THREAD_STATUS.Active) {
    const activeFlags = transition.activeFlags ?? [];
    if (activeFlags.length === 0) {
      if (context.state.approvalWaitActive) {
        if (context.state.approvedCount + context.state.cancelledCount !== 1) {
          throw createProtocolError("approval wait state cleared before a decision");
        }
        context.state.approvalWaitActive = false;
        context.state.approvalWaitCleared = true;
      }
      context.state.threadStatusTransitions.push(transition);
      return;
    }
    if (
      context.state.approvalWaitObserved ||
      context.state.approvalWaitActive ||
      context.state.fileChangeItems.size !== 1 ||
      [...context.state.fileChangeItems.values()].some((item) => item.approval !== null)
    ) {
      throw createProtocolError("approval wait state did not match one pending file change");
    }
    context.state.approvalWaitObserved = true;
    context.state.approvalWaitActive = true;
    context.state.threadStatusTransitions.push(transition);
    return;
  }
  if (
    !context.state.approvalWaitObserved ||
    !context.state.approvalWaitCleared ||
    context.state.approvalWaitActive ||
    context.state.approvalInFlight ||
    context.state.completedFileChangeCount !== context.state.fileChangeItems.size
  ) {
    throw createProtocolError("thread became idle before the approved file change completed");
  }
  context.state.idleObserved = true;
  context.state.threadStatusTransitions.push(transition);
}

function assertSuccessfulFileChanges(context: CodexAppServerProtocolContext): void {
  if (context.state.fileChangeItems.size === 0) {
    throw createProtocolError("turn completed without a file change item");
  }
  for (const item of context.state.fileChangeItems.values()) {
    if (item.approval !== CodexAppServerApprovalState.Accepted || !item.completed) {
      throw createProtocolError("turn completed without a completed approved file change");
    }
  }
  if (
    !context.state.approvalWaitObserved ||
    !context.state.approvalWaitCleared ||
    context.state.approvalWaitActive ||
    !context.state.idleObserved ||
    context.state.threadStatusTransitions.length !==
      CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.length
  ) {
    throw createProtocolError("turn completed without the required approval status transitions");
  }
}

function assertRequiredThreadStatusTransition(
  context: CodexAppServerProtocolContext,
  actual: CodexAppServerThreadStatusTransition,
): void {
  const expected =
    CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS[
      context.state.threadStatusTransitions.length
    ];
  if (
    expected === undefined ||
    expected.type !== actual.type ||
    JSON.stringify(expected.activeFlags ?? []) !== JSON.stringify(actual.activeFlags ?? [])
  ) {
    throw createProtocolError("thread status transition sequence is invalid");
  }
}

function normalizeThreadStatusTransition(
  status: CodexAppServerWireRecord,
): CodexAppServerThreadStatusTransition {
  if (status.type === CODEX_APP_SERVER_THREAD_STATUS.Active) {
    if (!hasExactKeys(status, ["activeFlags", "type"]) || !Array.isArray(status.activeFlags)) {
      throw createProtocolError("thread/status/changed active status is invalid");
    }
    if (status.activeFlags.length === 0) {
      return { type: CODEX_APP_SERVER_THREAD_STATUS.Active, activeFlags: [] };
    }
    if (
      status.activeFlags.length === 1 &&
      status.activeFlags[0] === CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS.WaitingOnApproval
    ) {
      return {
        type: CODEX_APP_SERVER_THREAD_STATUS.Active,
        activeFlags: [CODEX_APP_SERVER_THREAD_ACTIVE_FLAGS.WaitingOnApproval],
      };
    }
    throw createProtocolError("thread active flags are not allowed by the restricted protocol");
  }
  if (status.type !== CODEX_APP_SERVER_THREAD_STATUS.Idle || !hasExactKeys(status, ["type"])) {
    throw createProtocolError("thread/status/changed status is invalid");
  }
  return { type: CODEX_APP_SERVER_THREAD_STATUS.Idle };
}
