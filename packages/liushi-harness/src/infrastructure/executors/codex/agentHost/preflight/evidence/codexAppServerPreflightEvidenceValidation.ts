import {
  CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION,
  CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGIN,
  CODEX_APP_SERVER_PREFLIGHT_COMPLETED_RESPONSE_COUNTS,
  CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODE,
  CODEX_APP_SERVER_PREFLIGHT_PROCESS_COUNT,
  CODEX_APP_SERVER_PREFLIGHT_REAL_MODEL_REQUEST_COUNT,
  CODEX_APP_SERVER_PREFLIGHT_RESPONSES_REQUEST_COUNTS,
  CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS,
  CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION,
  CODEX_APP_SERVER_PREFLIGHT_THREAD_TRANSITIONS,
  CODEX_APP_SERVER_PREFLIGHT_TRANSPORT,
} from "../constants/index.js";
import type {
  CodexAppServerPreflightEvidenceBody,
  CodexAppServerPreflightScenarioEvidence,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_OUTCOMES } from "../../appServer/enums/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_RESULTS,
  CODEX_APP_SERVER_PREFLIGHT_SCENARIOS,
} from "../enums/index.js";
import { isCodexPreflightAbsolutePath } from "../platform/index.js";

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BODY_KEYS = [
  "schemaVersion",
  "codexExecutableDigest",
  "codexVersion",
  "executionMode",
  "authorizationOrigin",
  "processCount",
  "realModelRequests",
  "runnerLimits",
  "transport",
  "positive",
  "negative",
] as const;

/** 校验不含摘要的证据正文。 */
export function validatePreflightBody(body: CodexAppServerPreflightEvidenceBody): void {
  requirePlainRecord(body, "preflight evidence body");
  assertExactKeys(body, BODY_KEYS, "preflight evidence body");
  requireDigest(body.codexExecutableDigest, "codexExecutableDigest");
  if (
    body.schemaVersion !== CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION ||
    body.codexVersion !== CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION ||
    body.executionMode !== CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODE ||
    body.authorizationOrigin !== CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGIN ||
    body.processCount !== CODEX_APP_SERVER_PREFLIGHT_PROCESS_COUNT ||
    body.realModelRequests !== CODEX_APP_SERVER_PREFLIGHT_REAL_MODEL_REQUEST_COUNT
  ) {
    throw new Error("Preflight evidence 固定顶层字段无效");
  }
  assertFixedRecord(body.runnerLimits, CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS, "runnerLimits");
  assertFixedRecord(body.transport, CODEX_APP_SERVER_PREFLIGHT_TRANSPORT, "transport");
  validatePreflightScenario(body.positive, CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate);
  validatePreflightScenario(body.negative, CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.OutOfSetUpdate);
}

/** 将外部 evidence 的正文复制为纯数据结构。 */
export function copyPreflightEvidenceBody(
  value: Record<string, unknown>,
): CodexAppServerPreflightEvidenceBody {
  return {
    schemaVersion: value["schemaVersion"] as string,
    codexExecutableDigest: value["codexExecutableDigest"] as string,
    codexVersion: value["codexVersion"] as string,
    executionMode: value["executionMode"] as CodexAppServerPreflightEvidenceBody["executionMode"],
    authorizationOrigin: value[
      "authorizationOrigin"
    ] as CodexAppServerPreflightEvidenceBody["authorizationOrigin"],
    processCount: value["processCount"] as 2,
    realModelRequests: value["realModelRequests"] as 0,
    runnerLimits: value["runnerLimits"] as CodexAppServerPreflightEvidenceBody["runnerLimits"],
    transport: value["transport"] as CodexAppServerPreflightEvidenceBody["transport"],
    positive: value["positive"] as CodexAppServerPreflightEvidenceBody["positive"],
    negative: value["negative"] as CodexAppServerPreflightEvidenceBody["negative"],
  };
}

/** 校验单个场景的固定结果、计数和状态迁移。 */
export function validatePreflightScenario(
  value: unknown,
  scenario: CODEX_APP_SERVER_PREFLIGHT_SCENARIOS,
): void {
  requirePlainRecord(value, `${scenario} scenario`);
  assertExactKeys(
    value,
    [
      "scenario",
      "result",
      "outcome",
      "approvalRequestCount",
      "localModelRequestCount",
      "responsesRequestCount",
      "completedResponseCount",
      "targetChanged",
      "processExited",
      "processMayBeRunning",
      "threadStatusTransitions",
    ],
    `${scenario} scenario`,
  );
  const positive = scenario === CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate;
  const expectedResult = positive
    ? CODEX_APP_SERVER_PREFLIGHT_RESULTS.Accepted
    : CODEX_APP_SERVER_PREFLIGHT_RESULTS.Cancelled;
  const expectedOutcome = positive
    ? CODEX_APP_SERVER_OUTCOMES.Succeeded
    : CODEX_APP_SERVER_OUTCOMES.Denied;
  if (
    value["scenario"] !== scenario ||
    value["result"] !== expectedResult ||
    value["outcome"] !== expectedOutcome ||
    value["approvalRequestCount"] !== 1 ||
    value["localModelRequestCount"] !== 1 ||
    value["responsesRequestCount"] !==
      CODEX_APP_SERVER_PREFLIGHT_RESPONSES_REQUEST_COUNTS[scenario] ||
    value["completedResponseCount"] !==
      CODEX_APP_SERVER_PREFLIGHT_COMPLETED_RESPONSE_COUNTS[scenario] ||
    value["targetChanged"] !== positive ||
    value["processExited"] !== true ||
    value["processMayBeRunning"] !== false
  ) {
    throw new Error(`${scenario} scenario 固定字段无效`);
  }
  const transitions = requireDenseArray(
    value["threadStatusTransitions"],
    "threadStatusTransitions",
  );
  const expectedTransitions = positive
    ? CODEX_APP_SERVER_PREFLIGHT_THREAD_TRANSITIONS
    : CODEX_APP_SERVER_PREFLIGHT_THREAD_TRANSITIONS.slice(0, 2);
  if (transitions.length !== expectedTransitions.length)
    throw new Error("thread transitions 数量无效");
  transitions.forEach((transition, index) =>
    assertTransition(transition, expectedTransitions[index]!),
  );
}

function assertTransition(
  value: unknown,
  expected: CodexAppServerPreflightScenarioEvidence["threadStatusTransitions"][number],
): void {
  requirePlainRecord(value, "thread transition");
  const hasFlags = expected.activeFlags !== undefined;
  assertExactKeys(value, hasFlags ? ["type", "activeFlags"] : ["type"], "thread transition");
  if (value["type"] !== expected.type) throw new Error("thread transition type 无效");
  if (!hasFlags) return;
  const flags = requireDenseArray(value["activeFlags"], "thread transition activeFlags");
  const expectedFlags = expected.activeFlags ?? [];
  if (
    flags.length !== expectedFlags.length ||
    flags.some((flag, index) => flag !== expectedFlags[index])
  )
    throw new Error("thread transition activeFlags 无效");
}

function assertFixedRecord(value: unknown, expected: Record<string, unknown>, label: string): void {
  requirePlainRecord(value, label);
  assertExactKeys(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected))
    if (value[key] !== expectedValue) throw new Error(`${label}.${key} 无效`);
}

/** 校验 plain own-data record 并拒绝 accessor、数组与 Symbol 字段。 */
export function requirePlainRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} 必须是 plain record`);
  const prototype: object | null = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} 必须是 plain record`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key === "symbol" || descriptor === undefined || !Object.hasOwn(descriptor, "value"))
      throw new TypeError(`${label} 只接受 own data property`);
  }
}

/** 校验字段集合严格相等。 */
export function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index]))
    throw new Error(`${label} 字段集合无效`);
}

/** 校验 sha256 摘要格式。 */
export function requireDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_DIGEST.test(value)) throw new TypeError(`${label} 无效`);
}

/** 校验绝对路径与 NUL 边界。 */
export function requireAbsolutePath(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isCodexPreflightAbsolutePath(value)
  )
    throw new TypeError(`${label} 必须是无 NUL 的绝对路径`);
}

/** 校验数组没有空洞、访问器或额外字段。 */
export function requireDenseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} 必须是数组`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value"))
      throw new TypeError(`${label} 不得是 sparse/accessor 数组`);
  }
  for (const key of Reflect.ownKeys(value))
    if (key !== "length" && (!/^\d+$/u.test(String(key)) || Number(key) >= value.length))
      throw new TypeError(`${label} 不得包含额外字段`);
  return value;
}
