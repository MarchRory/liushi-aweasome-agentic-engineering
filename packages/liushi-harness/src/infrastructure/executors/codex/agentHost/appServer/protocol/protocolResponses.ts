import {
  CODEX_APP_SERVER_METHODS,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
  CODEX_APP_SERVER_REQUEST_IDS,
} from "../enums/index.js";
import type { CodexAppServerWireRecord } from "../contracts/index.js";
import {
  createThreadStartParams,
  createTurnStartParams,
  sendNotification,
  sendRequest,
} from "./protocolActions.js";
import type { CodexAppServerProtocolContext } from "./protocolState.js";
import {
  isRpcId,
  readThreadId,
  readTurnId,
  registerThreadId,
  registerTurnId,
  requireRecord,
  createProtocolError,
} from "./protocolWire.js";

/** 处理初始化、线程和 Turn 三个客户端请求的响应。 */
export function handleResponse(
  context: CodexAppServerProtocolContext,
  message: CodexAppServerWireRecord,
): void {
  const requestId = message.id;
  if (!isRpcId(requestId) || typeof requestId !== "number") {
    throw createProtocolError("server returned an unknown or duplicate response id");
  }
  const request = context.state.pendingRequests.get(requestId);
  if (request === undefined) {
    throw createProtocolError("server returned an unknown or duplicate response id");
  }
  context.state.pendingRequests.delete(requestId);
  if (message.error !== undefined) {
    throw createProtocolError(`${request.method} returned a JSON-RPC error`);
  }
  const result = requireRecord(message.result, `${request.method} result`);

  if (request.method === CODEX_APP_SERVER_METHODS.Initialize) {
    if (context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.InitializePending) {
      throw createProtocolError("initialize response arrived out of order");
    }
    sendNotification(context.io, CODEX_APP_SERVER_METHODS.Initialized, {});
    context.state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.ThreadPending;
    sendRequest(
      context,
      CODEX_APP_SERVER_REQUEST_IDS.ThreadStart,
      CODEX_APP_SERVER_METHODS.ThreadStart,
      createThreadStartParams(context.config),
    );
    return;
  }

  if (request.method === CODEX_APP_SERVER_METHODS.ThreadStart) {
    if (context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.ThreadPending) {
      throw createProtocolError("thread/start response arrived out of order");
    }
    registerThreadId(context, readThreadId(result), "thread/start response");
    context.state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.TurnPending;
    sendRequest(
      context,
      CODEX_APP_SERVER_REQUEST_IDS.TurnStart,
      CODEX_APP_SERVER_METHODS.TurnStart,
      createTurnStartParams(context.config, context.state.threadId),
    );
    return;
  }

  if (request.method === CODEX_APP_SERVER_METHODS.TurnStart) {
    if (context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.TurnPending) {
      throw createProtocolError("turn/start response arrived out of order");
    }
    if (!context.state.threadStarted) {
      throw createProtocolError("turn/start response arrived before thread/started");
    }
    registerTurnId(context, readTurnId(result), "turn/start response");
    context.state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.Running;
    return;
  }

  throw createProtocolError("client request method was not recognized");
}
