import { createServer as defaultCreateServer } from "node:http";

import { CODEX_PREFLIGHT_SSE_EVENTS } from "./preflightConstants.mjs";

export async function createCodexPreflightResponsesServer(input, overrides = {}) {
  if (typeof input?.patch !== "string" || input.patch.length === 0) {
    throw new TypeError("preflight Responses patch is required");
  }
  const createServer = overrides.createServer ?? defaultCreateServer;
  const server = createServer((request, response) => {
    handleRequest(request, response, input.patch, state);
  });
  const state = {
    requestCount: 0,
    toolCallCount: 0,
    completedResponseCount: 0,
    closePromise: null,
  };
  server.on("error", (error) => {
    state.error = error;
  });

  await listen(server);
  const address = server.address();
  if (address === null || typeof address === "string" || !Number.isSafeInteger(address.port)) {
    throw new Error("loopback Responses server did not expose a port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => closeServer(server, state),
    getEvidence: () => ({
      localModelRequestCount: state.toolCallCount,
      requestCount: state.requestCount,
      completedResponseCount: state.completedResponseCount,
    }),
  };
}

export async function closeCodexPreflightResponsesServer(server) {
  if (typeof server?.close !== "function") {
    throw new Error("loopback Responses server has no close function");
  }
  const result = await server.close();
  if (result?.confirmed !== true && result?.confirmedExit !== true) {
    throw new Error("loopback Responses server exit was not confirmed");
  }
  return result;
}

function handleRequest(request, response, patch, state) {
  if (request.method !== "POST" || request.url !== "/v1/responses") {
    request.resume();
    response.statusCode = 404;
    response.end();
    return;
  }
  state.requestCount += 1;
  request.on("data", () => {});
  request.on("error", () => response.destroy());
  request.on("end", () => {
    if (response.writableEnded || response.destroyed) return;
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "close");
    if (state.requestCount === 1) {
      state.toolCallCount += 1;
      const item = {
        type: "custom_tool_call",
        name: "apply_patch",
        input: patch,
        call_id: "c",
      };
      writeEvent(response, CODEX_PREFLIGHT_SSE_EVENTS.OutputItemDone, {
        type: CODEX_PREFLIGHT_SSE_EVENTS.OutputItemDone,
        item,
      });
    }
    state.completedResponseCount += 1;
    writeEvent(response, CODEX_PREFLIGHT_SSE_EVENTS.Completed, {
      type: CODEX_PREFLIGHT_SSE_EVENTS.Completed,
      response: {
        id: `preflight-response-${state.completedResponseCount}`,
        status: "completed",
      },
    });
    response.end();
  });
}

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 0 });
  });
}

function closeServer(server, state) {
  if (state.closePromise !== null) return state.closePromise;
  state.closePromise = new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve({ confirmed: true });
      return;
    }
    server.close((error) => {
      if (error !== undefined && error !== null) {
        reject(error);
        return;
      }
      resolve({ confirmed: true });
    });
  });
  return state.closePromise;
}
