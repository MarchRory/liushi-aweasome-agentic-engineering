import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

import {
  CODEX_PREFLIGHT_REQUEST_BODY_LIMIT_BYTES,
  CODEX_PREFLIGHT_EXPECTED_RESPONSES_REQUEST_COUNT,
  CODEX_PREFLIGHT_SSE_EVENTS,
} from "../constants/index.js";
import type {
  CodexPreflightResponsesServerEvidence,
  CodexPreflightResponsesServerHandle,
  CodexPreflightResponsesServerInput,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_PREFLIGHT_SCENARIOS as CodexPreflightScenario } from "../enums/index.js";
import { validateCodexPreflightResponsesRequest } from "./codexPreflightResponsesRequestValidation.js";
import {
  closeCodexPreflightResponsesServerLifecycle,
  listenCodexPreflightResponsesServer,
} from "./codexPreflightResponsesServerLifecycle.js";

/** 创建本机 Responses SSE server 的输入。 */
interface ResponsesServerState {
  readonly expectedRequestCount: number;
  readonly nonce: string;
  requestCount: number;
  toolCallCount: number;
  completedResponseCount: number;
  activeResponse: ServerResponse | undefined;
  fatalError: Error | undefined;
  closePromise: Promise<{ readonly confirmed: true }> | undefined;
  readonly sockets: Set<Socket>;
}

/** 创建只监听 loopback 的零模型 Responses SSE server。 */
export async function createCodexPreflightResponsesServer(
  input: CodexPreflightResponsesServerInput,
): Promise<CodexPreflightResponsesServerHandle> {
  requireInput(input);
  const nonce = randomBytes(32).toString("hex");
  const expectedRequestCount = CODEX_PREFLIGHT_EXPECTED_RESPONSES_REQUEST_COUNT[input.scenario];
  const state: ResponsesServerState = {
    expectedRequestCount,
    nonce,
    requestCount: 0,
    toolCallCount: 0,
    completedResponseCount: 0,
    activeResponse: undefined,
    fatalError: undefined,
    closePromise: undefined,
    sockets: new Set<Socket>(),
  };
  const path = `/v1/${nonce}/responses`;
  const server = createServer((request, response) => {
    handleRequest(request, response, path, input.patch, input.model, state);
  });
  server.on("connection", (socket) => {
    state.sockets.add(socket);
    socket.once("close", () => state.sockets.delete(socket));
  });
  server.on("error", (cause: Error) => {
    recordFatal(state, new Error("预检 Responses server 运行时失败。", { cause }));
  });
  await listenCodexPreflightResponsesServer(server);
  const address = server.address();
  if (address === null || typeof address === "string" || !Number.isSafeInteger(address.port)) {
    throw new Error("预检 Responses server 未暴露 loopback 端口。");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1/${nonce}`,
    getEvidence: () => getEvidence(state),
    close: () => closeCodexPreflightResponsesServerLifecycle(server, state),
  };
}

/** 关闭由本模块创建的 server，并要求真实确认已关闭。 */
export async function closeCodexPreflightResponsesServer(
  server: CodexPreflightResponsesServerHandle,
): Promise<{ readonly confirmed: true }> {
  if (typeof server.close !== "function") throw new Error("预检 Responses server 缺少 close。");
  return server.close();
}

function requireInput(input: CodexPreflightResponsesServerInput): void {
  if (
    (input.scenario !== CodexPreflightScenario.AllowedUpdate &&
      input.scenario !== CodexPreflightScenario.OutOfSetUpdate) ||
    typeof input.patch !== "string" ||
    input.patch.length === 0 ||
    typeof input.model !== "string" ||
    input.model.length === 0 ||
    input.model !== input.model.trim()
  ) {
    throw new TypeError("预检 Responses server 的 scenario 与 patch 无效。");
  }
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  expectedPath: string,
  patch: string,
  expectedModel: string,
  state: ResponsesServerState,
): void {
  try {
    if (request.method !== "POST" || request.url !== expectedPath) {
      recordFatal(state, new Error("预检 Responses server 收到非法 method 或 path。"));
      request.resume();
      response.statusCode = 400;
      response.end();
      return;
    }
    if (state.activeResponse !== undefined) {
      const error = new Error("预检 Responses server 不允许并发请求。");
      recordFatal(state, error);
      state.activeResponse.destroy(error);
      request.destroy(error);
      response.destroy(error);
      return;
    }
    if (state.requestCount >= state.expectedRequestCount) {
      recordFatal(state, new Error("预检 Responses server 收到重复或额外请求。"));
      request.resume();
      response.statusCode = 400;
      response.end();
      return;
    }
    const expectedContentLength = assertContentLengthWithinLimit(request, response, state);
    if (expectedContentLength === undefined || state.fatalError !== undefined) return;
    state.requestCount += 1;
    state.activeResponse = response;
    response.once("finish", () => {
      state.completedResponseCount += 1;
      if (state.activeResponse === response) state.activeResponse = undefined;
    });
    let bytes = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      chunks.push(buffer);
      if (bytes > CODEX_PREFLIGHT_REQUEST_BODY_LIMIT_BYTES) {
        failRequest(state, request, response, new Error("预检 Responses 请求体超过固定上限。"));
      }
    });
    request.once("error", (cause: Error) => {
      recordFatal(state, new Error("预检 Responses 请求读取失败。", { cause }));
      response.destroy(cause);
    });
    request.once("aborted", () => {
      recordFatal(state, new Error("预检 Responses 请求被中止。"));
      response.destroy();
    });
    request.once("end", () => {
      if (state.fatalError !== undefined || response.destroyed || response.writableEnded) return;
      if (bytes !== expectedContentLength) {
        failRequest(state, request, response, new Error("预检 Responses Content-Length 不匹配。"));
        return;
      }
      try {
        validateCodexPreflightResponsesRequest(
          Buffer.concat(chunks),
          request.headers["content-type"],
          expectedModel,
        );
      } catch (cause) {
        failRequest(
          state,
          request,
          response,
          cause instanceof Error ? cause : new Error(String(cause)),
        );
        return;
      }
      response.once("error", (cause: Error) => {
        recordFatal(state, new Error("预检 Responses 响应写入失败。", { cause }));
      });
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "close");
      try {
        if (state.toolCallCount === 0) {
          state.toolCallCount += 1;
          writeEvent(response, CODEX_PREFLIGHT_SSE_EVENTS.OutputItemDone, {
            type: CODEX_PREFLIGHT_SSE_EVENTS.OutputItemDone,
            item: {
              type: "custom_tool_call",
              name: "apply_patch",
              input: patch,
              call_id: "preflight",
            },
          });
        }
        writeEvent(response, CODEX_PREFLIGHT_SSE_EVENTS.Completed, {
          type: CODEX_PREFLIGHT_SSE_EVENTS.Completed,
          response: {
            id: `preflight-response-${state.requestCount}`,
            status: "completed",
          },
        });
        response.end();
      } catch (cause) {
        recordFatal(state, new Error("预检 Responses 响应生成失败。", { cause }));
        response.destroy(cause instanceof Error ? cause : undefined);
      }
    });
  } catch (cause) {
    recordFatal(state, new Error("预检 Responses handler 失败。", { cause }));
    response.destroy(cause instanceof Error ? cause : undefined);
  }
}

function failRequest(
  state: ResponsesServerState,
  request: IncomingMessage,
  response: ServerResponse,
  error: Error,
): void {
  recordFatal(state, error);
  request.destroy(error);
  response.destroy(error);
}

function writeEvent(response: ServerResponse, event: string, payload: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function getEvidence(state: ResponsesServerState): CodexPreflightResponsesServerEvidence {
  if (state.fatalError !== undefined) throw state.fatalError;
  if (
    state.activeResponse !== undefined ||
    state.requestCount !== state.expectedRequestCount ||
    state.toolCallCount !== 1 ||
    state.completedResponseCount !== state.expectedRequestCount
  ) {
    throw new Error("预检 Responses evidence 未达到精确请求计数。");
  }
  return {
    localModelRequestCount: state.toolCallCount,
    requestCount: state.requestCount,
    completedResponseCount: state.completedResponseCount,
  };
}

function recordFatal(state: ResponsesServerState, error: Error): void {
  state.fatalError ??= error;
}

function assertContentLengthWithinLimit(
  request: IncomingMessage,
  response: ServerResponse,
  state: ResponsesServerState,
): number | undefined {
  const contentLength = request.headers["content-length"];
  if (contentLength === undefined) {
    failRequest(state, request, response, new Error("预检 Responses 缺少 Content-Length。"));
    return undefined;
  }
  if (
    !/^(?:0|[1-9]\d*)$/u.test(contentLength) ||
    !Number.isSafeInteger(Number(contentLength)) ||
    Number(contentLength) > CODEX_PREFLIGHT_REQUEST_BODY_LIMIT_BYTES
  ) {
    failRequest(state, request, response, new Error("预检 Responses Content-Length 无效。"));
    return undefined;
  }
  return Number(contentLength);
}
