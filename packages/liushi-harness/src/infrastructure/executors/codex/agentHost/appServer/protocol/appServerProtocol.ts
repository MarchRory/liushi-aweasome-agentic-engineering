import { createHash } from "node:crypto";

import { CODEX_APP_SERVER_CLIENT_INFO } from "../constants/index.js";
import {
  attachCodexAppServerProcessState,
  CodexAppServerError,
  type CodexAppServerConfig,
  type CodexAppServerIo,
  type CodexAppServerProcessInfo,
  type CodexAppServerProtocol,
  type CodexAppServerResult,
} from "../contracts/index.js";
import {
  CODEX_APP_SERVER_METHODS,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
  CODEX_APP_SERVER_REQUEST_IDS,
  CODEX_APP_SERVER_TERMINATION_REASONS,
} from "../enums/index.js";
import { sendRequest } from "./protocolActions.js";
import { handleServerRequest } from "./protocolApprovals.js";
import { handleResponse } from "./protocolResponses.js";
import {
  createCodexAppServerProtocolState,
  createProtocolEvidence,
  type CodexAppServerProtocolContext,
} from "./protocolState.js";
import { handleNotification } from "./protocolNotifications.js";
import { asProtocolError, isRecord, recordMethod, requireMethod } from "./protocolWire.js";

/** 创建受限 Codex App Server JSON-RPC 协议处理器。 */
export function createCodexAppServerProtocol(
  config: CodexAppServerConfig,
  io: CodexAppServerIo,
): CodexAppServerProtocol {
  const state = createCodexAppServerProtocolState(
    createHash("sha256"),
    CODEX_APP_SERVER_PROTOCOL_PHASES.Created,
  );
  const context: CodexAppServerProtocolContext = {
    config,
    io,
    state,
    fail,
  };

  return {
    start,
    handleLine,
    fail,
    abort,
    finalize,
    getEvidence: () => createProtocolEvidence(state),
    getFailure: () => state.failure,
    getOutcome: () => state.outcome,
    getPolicyDenied: () => state.policyDenied,
  };

  function start(): void {
    if (state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.Created) {
      throw new CodexAppServerError("app-server protocol already started");
    }
    state.phase = CODEX_APP_SERVER_PROTOCOL_PHASES.InitializePending;
    sendRequest(
      context,
      CODEX_APP_SERVER_REQUEST_IDS.Initialize,
      CODEX_APP_SERVER_METHODS.Initialize,
      {
        clientInfo: CODEX_APP_SERVER_CLIENT_INFO,
        capabilities: { experimentalApi: true },
      },
    );
  }

  async function handleLine(line: string): Promise<void> {
    if (state.failure !== null) return;
    state.eventCount += 1;
    let message: unknown;
    try {
      message = JSON.parse(line) as unknown;
    } catch (cause) {
      fail(new CodexAppServerError("server emitted invalid JSONL", { cause }));
      return;
    }
    if (!isRecord(message)) {
      fail(new CodexAppServerError("server emitted a non-object JSONL message"));
      return;
    }

    try {
      const hasMethod = Object.hasOwn(message, "method");
      const hasId = Object.hasOwn(message, "id");
      if (hasMethod) {
        const method = requireMethod(message.method);
        recordMethod(state, method);
        if (hasId) {
          state.requestCount += 1;
          await handleServerRequest(context, message);
        } else {
          state.notificationCount += 1;
          handleNotification(context, method, message.params);
        }
        return;
      }
      if (hasId) {
        state.responseCount += 1;
        handleResponse(context, message);
        return;
      }
      throw new CodexAppServerError("server emitted a message without method or id");
    } catch (error) {
      fail(asProtocolError(error));
    }
  }

  function fail(
    error: unknown,
    reason: CODEX_APP_SERVER_TERMINATION_REASONS = CODEX_APP_SERVER_TERMINATION_REASONS.ProtocolError,
  ): void {
    if (error !== null && error !== undefined) state.failure ??= asProtocolError(error);
    io.requestTermination(reason);
  }

  function abort(reason: CODEX_APP_SERVER_TERMINATION_REASONS): void {
    state.approvalInFlight = false;
    state.failure ??= new CodexAppServerError(`app-server protocol aborted: ${String(reason)}`);
  }

  function finalize(processInfo: CodexAppServerProcessInfo): CodexAppServerResult {
    if (state.failure !== null) {
      const error = attachCodexAppServerProcessState(state.failure, processInfo);
      error.protocolEvidence = createProtocolEvidence(state);
      throw error;
    }
    if (state.policyDenied) {
      return {
        outcome: CODEX_APP_SERVER_OUTCOMES.Denied,
        process: processInfo,
        protocolEvidence: createProtocolEvidence(state),
      };
    }
    if (!state.turnCompleted || state.outcome === null) {
      const error = attachCodexAppServerProcessState(
        new CodexAppServerError("app-server closed before a terminal turn/completed"),
        processInfo,
      );
      error.protocolEvidence = createProtocolEvidence(state);
      throw error;
    }
    return {
      outcome: state.outcome,
      process: processInfo,
      protocolEvidence: createProtocolEvidence(state),
    };
  }
}
