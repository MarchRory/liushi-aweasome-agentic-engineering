import { CODEX_APP_SERVER_METHODS, CODEX_APP_SERVER_PROTOCOL_PHASES } from "../enums/index.js";
import {
  handleFileChangePatchUpdated,
  handleItemCompleted,
  handleItemStarted,
} from "./protocolItems.js";
import {
  handleRemoteControlStatusChanged,
  handleServerRequestResolved,
  handleThreadStatusChanged,
  handleTurnCompleted,
} from "./protocolStatus.js";
import type { CodexAppServerProtocolContext } from "./protocolState.js";
import {
  assertOptionalContext,
  assertContext,
  assertTurnLifecycleStarted,
  createProtocolError,
  isSafeProgressNotification,
  readThreadId,
  readTurnId,
  requireIdentifier,
  requireRecord,
} from "./protocolWire.js";

/** 按方法分发服务端通知和请求。 */
export function handleNotification(
  context: CodexAppServerProtocolContext,
  method: string,
  params: unknown,
): void {
  const methodValue = method as CODEX_APP_SERVER_METHODS;
  if (methodValue === CODEX_APP_SERVER_METHODS.ThreadStarted) {
    if (context.state.threadStarted) throw createProtocolError("thread/started was repeated");
    if (
      context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.TurnPending ||
      context.state.threadId === null
    ) {
      throw createProtocolError("thread/started arrived before thread/start response");
    }
    const value = requireRecord(params, "thread/started params");
    const threadId = requireIdentifier(readThreadId(value), "thread/started.threadId");
    if (threadId !== context.state.threadId) {
      throw createProtocolError("thread/started thread identity did not match");
    }
    context.state.threadStarted = true;
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.TurnStarted) {
    if (context.state.turnStarted) throw createProtocolError("turn/started was repeated");
    if (
      context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.Running ||
      !context.state.threadStarted ||
      context.state.threadId === null ||
      context.state.turnId === null
    ) {
      throw createProtocolError("turn/started arrived before turn/start response");
    }
    const value = requireRecord(params, "turn/started params");
    const threadId = requireIdentifier(value.threadId, "turn/started threadId");
    const turnId = requireIdentifier(readTurnId(value), "turn/started turnId");
    assertContext(context, threadId, turnId, "turn/started");
    context.state.turnStarted = true;
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.ItemStarted) {
    handleItemStarted(context, requireRecord(params, "item/started params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.ItemCompleted) {
    handleItemCompleted(context, requireRecord(params, "item/completed params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.TurnCompleted) {
    handleTurnCompleted(context, requireRecord(params, "turn/completed params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.FileChangePatchUpdated) {
    handleFileChangePatchUpdated(context, requireRecord(params, "file change patch params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.ServerRequestResolved) {
    handleServerRequestResolved(context, requireRecord(params, "serverRequest/resolved params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.RemoteControlStatusChanged) {
    handleRemoteControlStatusChanged(requireRecord(params, "remoteControl/status/changed params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.ThreadStatusChanged) {
    handleThreadStatusChanged(context, requireRecord(params, "thread/status/changed params"));
    return;
  }
  if (methodValue === CODEX_APP_SERVER_METHODS.AccountRateLimitsUpdated) {
    requireRecord(
      requireRecord(params, "account/rateLimits/updated params").rateLimits,
      "account/rateLimits/updated rateLimits",
    );
    return;
  }
  if (isSafeProgressNotification(method)) {
    assertTurnLifecycleStarted(context, method);
    assertOptionalContext(context, params, method);
    return;
  }
  throw createProtocolError("unknown server notification");
}
