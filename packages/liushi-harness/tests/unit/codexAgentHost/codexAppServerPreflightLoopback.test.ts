import { request as httpRequest } from "node:http";

import { describe, expect, it } from "vitest";

import {
  CODEX_PREFLIGHT_PROMPT,
  CodexPreflightScenario,
  closeCodexPreflightResponsesServer,
  createCodexPreflightResponsesServer,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";

const MODEL = "preflight-model";
const REQUEST_BODY = createRequestBody(MODEL);

describe("Codex App Server Preflight loopback", () => {
  it("使用 nonce exact path，正向为 2 requests、1 tool call、2 completed", async () => {
    const server = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.AllowedUpdate,
      patch: "patch",
      model: MODEL,
    });
    try {
      const first = await sendRequest(`${server.baseUrl}/responses`, "POST", REQUEST_BODY, {});
      const second = await sendRequest(`${server.baseUrl}/responses`, "POST", REQUEST_BODY, {});
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.match(/event: response.output_item.done/g)).toHaveLength(1);
      expect(first.body.match(/event: response.completed/g)).toHaveLength(1);
      expect(second.body).not.toContain("response.output_item.done");
      expect(server.getEvidence()).toEqual({
        localModelRequestCount: 1,
        requestCount: 2,
        completedResponseCount: 2,
      });
    } finally {
      await closeCodexPreflightResponsesServer(server);
      await server.close();
    }
  });

  it("负向为 1 request、1 tool call、1 completed，close 幂等", async () => {
    const server = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.OutOfSetUpdate,
      patch: "patch",
      model: MODEL,
    });
    try {
      const response = await sendRequest(`${server.baseUrl}/responses`, "POST", REQUEST_BODY, {});
      expect(response.status).toBe(200);
      expect(server.getEvidence()).toEqual({
        localModelRequestCount: 1,
        requestCount: 1,
        completedResponseCount: 1,
      });
      const firstClose = server.close();
      const secondClose = server.close();
      expect(secondClose).toBe(firstClose);
      await expect(firstClose).resolves.toEqual({ confirmed: true });
    } finally {
      await server.close();
    }
  });

  it("拒绝正向场景中的并发请求，且不生成可接受证据", async () => {
    const server = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.AllowedUpdate,
      patch: "patch",
      model: MODEL,
    });
    const first = startDeferredRequest(`${server.baseUrl}/responses`, REQUEST_BODY);
    first.response.catch(() => undefined);
    try {
      await delay(25);
      await expect(
        sendRequest(`${server.baseUrl}/responses`, "POST", REQUEST_BODY, {}),
      ).rejects.toThrow();
      expect(() => server.getEvidence()).toThrow();
      first.request.destroy();
      await expect(server.close()).rejects.toThrow("不允许并发请求");
    } finally {
      first.request.destroy();
      await server.close().catch(() => undefined);
    }
  });

  it("将额外请求、错误 method/path、超限 Content-Length 和未达计数传播为 evidence 或 close 错误", async () => {
    const extra = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.AllowedUpdate,
      patch: "patch",
      model: MODEL,
    });
    await sendRequest(`${extra.baseUrl}/responses`, "POST", REQUEST_BODY, {});
    await sendRequest(`${extra.baseUrl}/responses`, "POST", REQUEST_BODY, {});
    await sendRequest(`${extra.baseUrl}/responses`, "POST", REQUEST_BODY, {});
    expect(() => extra.getEvidence()).toThrow();
    await expect(extra.close()).rejects.toThrow();

    const wrongMethod = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.OutOfSetUpdate,
      patch: "patch",
      model: MODEL,
    });
    await sendRequest(`${wrongMethod.baseUrl}/responses`, "GET", "", {});
    expect(() => wrongMethod.getEvidence()).toThrow();
    await expect(wrongMethod.close()).rejects.toThrow();

    const wrongPath = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.OutOfSetUpdate,
      patch: "patch",
      model: MODEL,
    });
    await sendRequest(`${wrongPath.baseUrl}/wrong`, "POST", REQUEST_BODY, {});
    expect(() => wrongPath.getEvidence()).toThrow();
    await expect(wrongPath.close()).rejects.toThrow();

    const oversized = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.OutOfSetUpdate,
      patch: "patch",
      model: MODEL,
    });
    await sendRequest(`${oversized.baseUrl}/responses`, "POST", REQUEST_BODY, {
      "content-length": "999999999999999999999",
    });
    expect(() => oversized.getEvidence()).toThrow();
    await oversized.close();

    const incomplete = await createCodexPreflightResponsesServer({
      scenario: CodexPreflightScenario.AllowedUpdate,
      patch: "patch",
      model: MODEL,
    });
    expect(() => incomplete.getEvidence()).toThrow();
    await expect(incomplete.close()).resolves.toEqual({ confirmed: true });
  });

  it("拒绝错误 JSON、model、Content-Type 和缺失固定 Prompt", async () => {
    for (const request of [
      { body: "{", headers: {} },
      { body: createRequestBody("other-model"), headers: {} },
      { body: createRequestBody(MODEL, false), headers: {} },
      { body: REQUEST_BODY, headers: { "content-type": "text/plain" } },
    ]) {
      const server = await createCodexPreflightResponsesServer({
        scenario: CodexPreflightScenario.OutOfSetUpdate,
        patch: "patch",
        model: MODEL,
      });
      await expect(
        sendRequest(`${server.baseUrl}/responses`, "POST", request.body, request.headers),
      ).rejects.toThrow();
      await expect(server.close()).rejects.toThrow();
    }
  });
});

function createRequestBody(model: string, includePrompt = true): string {
  return JSON.stringify({
    client_metadata: {},
    include: [],
    input: [
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: includePrompt ? CODEX_PREFLIGHT_PROMPT : "unexpected",
          },
        ],
      },
    ],
    model,
    parallel_tool_calls: false,
    prompt_cache_key: null,
    reasoning: null,
    store: false,
    stream: true,
    text: null,
    tool_choice: "auto",
  });
}

function sendRequest(
  url: string,
  method: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: target.pathname,
        method,
        headers: {
          "content-type": "application/json",
          connection: "close",
          "content-length": String(Buffer.byteLength(body)),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

function startDeferredRequest(
  url: string,
  body: string,
): {
  readonly request: ReturnType<typeof httpRequest>;
  readonly response: Promise<{ status: number; body: string }>;
} {
  const target = new URL(url);
  let request: ReturnType<typeof httpRequest>;
  const response = new Promise<{ status: number; body: string }>((resolve, reject) => {
    request = httpRequest(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: target.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          connection: "close",
          "content-length": String(Buffer.byteLength(body)),
        },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () =>
          resolve({
            status: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.flushHeaders();
    request.write(body.slice(0, 1));
  });
  return { request: request!, response };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
