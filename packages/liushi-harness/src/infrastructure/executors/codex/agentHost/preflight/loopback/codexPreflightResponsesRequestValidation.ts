import {
  CODEX_PREFLIGHT_PROMPT,
  CODEX_PREFLIGHT_RESPONSES_CONTENT_TYPE,
  CODEX_PREFLIGHT_RESPONSES_REQUEST_KEYS,
} from "../constants/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_REQUEST_CONTENT_TYPES,
  CODEX_APP_SERVER_PREFLIGHT_REQUEST_ITEM_TYPES,
  CODEX_APP_SERVER_PREFLIGHT_REQUEST_ROLES,
  CODEX_APP_SERVER_PREFLIGHT_TOOL_CHOICES,
} from "../enums/index.js";

/** 校验固定 Codex 版本发送给本地 Responses 服务的最小请求契约。 */
export function validateCodexPreflightResponsesRequest(
  body: Buffer,
  contentType: string | undefined,
  expectedModel: string,
): void {
  if (contentType !== CODEX_PREFLIGHT_RESPONSES_CONTENT_TYPE) {
    throw new Error("预检 Responses Content-Type 无效。");
  }
  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8")) as unknown;
  } catch (cause) {
    throw new Error("预检 Responses 请求体不是有效 JSON。", { cause });
  }
  const request = requireRecord(value, "预检 Responses 请求体");
  assertExactKeys(request, CODEX_PREFLIGHT_RESPONSES_REQUEST_KEYS);
  if (
    request["model"] !== expectedModel ||
    request["stream"] !== true ||
    request["store"] !== false ||
    request["parallel_tool_calls"] !== false ||
    request["tool_choice"] !== CODEX_APP_SERVER_PREFLIGHT_TOOL_CHOICES.Auto
  ) {
    throw new Error("预检 Responses 请求运行参数无效。");
  }
  const input = request["input"];
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("预检 Responses input 必须是非空数组。");
  }
  let promptCount = 0;
  for (const item of input as unknown[]) {
    promptCount += countFixedPrompt(item);
  }
  if (promptCount !== 1) {
    throw new Error("预检 Responses input 未精确绑定固定 Prompt。");
  }
}

function countFixedPrompt(value: unknown): number {
  if (!isRecord(value)) return 0;
  if (
    value["type"] !== CODEX_APP_SERVER_PREFLIGHT_REQUEST_ITEM_TYPES.Message ||
    value["role"] !== CODEX_APP_SERVER_PREFLIGHT_REQUEST_ROLES.User ||
    !Array.isArray(value["content"])
  ) {
    return 0;
  }
  return value["content"].filter(
    (content) =>
      isRecord(content) &&
      content["type"] === CODEX_APP_SERVER_PREFLIGHT_REQUEST_CONTENT_TYPES.InputText &&
      content["text"] === CODEX_PREFLIGHT_PROMPT,
  ).length;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label}必须是普通对象。`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error("预检 Responses 请求字段集合无效。");
  }
}
