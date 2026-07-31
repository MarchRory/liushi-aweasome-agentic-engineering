import { calculateCanonicalJsonSha256 as calculateRfc8785JsonSha256 } from "#infrastructure/serialization/jsonDigest/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION,
  CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGIN,
  CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODE,
  CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS,
  CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION,
  CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION,
  CODEX_APP_SERVER_PREFLIGHT_TRANSPORT,
} from "../constants/index.js";
import type {
  CodexAppServerPreflightEvidence,
  CodexAppServerPreflightEvidenceBody,
  CodexAppServerPreflightEvidenceExpectation,
  CodexAppServerPreflightEvidenceInput,
  CodexAppServerPreflightRootDescriptor,
  CodexAppServerPreflightRootInput,
  CodexAppServerPreflightScenarioEvidence,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_PREFLIGHT_SCENARIOS } from "../enums/index.js";
import {
  assertExactKeys,
  copyPreflightEvidenceBody,
  requireAbsolutePath,
  requireDenseArray,
  requireDigest,
  requirePlainRecord,
  validatePreflightBody,
  validatePreflightScenario,
} from "./codexAppServerPreflightEvidenceValidation.js";

const OWNER_TOKEN = /^[0-9a-f]{64}$/u;

/** 创建固定 schema 的 App Server Preflight 证据。 */
export function createCodexAppServerPreflightEvidence(
  input: CodexAppServerPreflightEvidenceInput,
): CodexAppServerPreflightEvidence {
  requirePlainRecord(input, "preflight input");
  assertAllowedInputKeys(input);
  const codexVersion = input.codexVersion ?? CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION;
  if (codexVersion !== CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION) {
    throw new Error("Codex App Server Preflight 只支持固定 Codex 版本");
  }
  requireDigest(input.codexExecutableDigest, "codexExecutableDigest");
  const positive = selectScenario(input, CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate);
  const negative = selectScenario(input, CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.OutOfSetUpdate);
  const body: CodexAppServerPreflightEvidenceBody = {
    schemaVersion: CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION,
    codexExecutableDigest: input.codexExecutableDigest,
    codexVersion,
    executionMode: CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODE,
    authorizationOrigin: CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGIN,
    processCount: 2,
    realModelRequests: 0,
    runnerLimits: { ...CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS },
    transport: { ...CODEX_APP_SERVER_PREFLIGHT_TRANSPORT },
    positive: cloneScenario(positive),
    negative: cloneScenario(negative),
  };
  validatePreflightBody(body);
  return { ...body, evidenceDigest: calculateEvidenceDigest(body) };
}

/** 校验完整证据；任一 schema、闭集、计数、transition 或摘要不符即拒绝。 */
export function validateCodexAppServerPreflightEvidence(
  value: unknown,
  expectation?: CodexAppServerPreflightEvidenceExpectation,
): CodexAppServerPreflightEvidence {
  requirePlainRecord(value, "preflight evidence");
  assertExactKeys(
    value,
    [
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
      "evidenceDigest",
    ],
    "preflight evidence",
  );
  requireDigest(value["evidenceDigest"], "evidenceDigest");
  const body = copyPreflightEvidenceBody(value);
  if (expectation !== undefined) {
    requirePlainRecord(expectation, "preflight evidence expectation");
    assertExactKeys(
      expectation,
      ["codexExecutableDigest", "codexVersion"],
      "preflight evidence expectation",
    );
    requireDigest(expectation.codexExecutableDigest, "expected codexExecutableDigest");
    if (
      body.codexExecutableDigest !== expectation.codexExecutableDigest ||
      body.codexVersion !== expectation.codexVersion
    ) {
      throw new Error("Preflight Codex identity 不匹配");
    }
  }
  validatePreflightBody(body);
  if (calculateEvidenceDigest(body) !== value["evidenceDigest"]) {
    throw new Error("Preflight evidenceDigest 校验失败");
  }
  return value as unknown as CodexAppServerPreflightEvidence;
}

/** 兼容旧 Pilot 调用方的证据工厂名称。 */
export const createCodexPreflightEvidence = createCodexAppServerPreflightEvidence;

/** 创建并校验临时根目录描述。 */
export function createCodexAppServerPreflightRootDescriptor(
  input: CodexAppServerPreflightRootInput,
): CodexAppServerPreflightRootDescriptor {
  requirePlainRecord(input, "preflight root input");
  requireAbsolutePath(input.root, "root");
  if (typeof input.ownerToken !== "string" || !OWNER_TOKEN.test(input.ownerToken)) {
    throw new TypeError("ownerToken 必须是 32 字节 lowercase hex");
  }
  return {
    schemaVersion: CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION,
    root: input.root,
    ownerToken: input.ownerToken,
  };
}

/** 校验根目录描述的固定 schema 与 ownership 字段。 */
export function validateCodexAppServerPreflightRootDescriptor(
  value: unknown,
): asserts value is CodexAppServerPreflightRootDescriptor {
  requirePlainRecord(value, "preflight root descriptor");
  assertExactKeys(value, ["schemaVersion", "root", "ownerToken"], "preflight root descriptor");
  if (value["schemaVersion"] !== CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION) {
    throw new Error("Preflight root descriptor schema 无效");
  }
  requireAbsolutePath(value["root"], "root");
  if (typeof value["ownerToken"] !== "string" || !OWNER_TOKEN.test(value["ownerToken"])) {
    throw new Error("Preflight root descriptor ownerToken 无效");
  }
}

function selectScenario(
  input: CodexAppServerPreflightEvidenceInput,
  scenario: CODEX_APP_SERVER_PREFLIGHT_SCENARIOS,
): CodexAppServerPreflightScenarioEvidence {
  const hasDirectInput = input.positive !== undefined || input.negative !== undefined;
  const hasScenarioResults = input.scenarioResults !== undefined;
  if (hasDirectInput === hasScenarioResults) {
    throw new Error("Preflight evidence 必须且只能使用一种场景输入形式");
  }
  const direct =
    scenario === CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate
      ? input.positive
      : input.negative;
  const fromList = findScenario(input.scenarioResults, scenario);
  const selected = direct ?? fromList;
  if (selected === undefined) throw new Error(`${scenario} scenario evidence 缺失`);
  requirePlainRecord(selected, `${scenario} scenario`);
  validatePreflightScenario(selected, scenario);
  return selected as unknown as CodexAppServerPreflightScenarioEvidence;
}

function cloneScenario(
  value: CodexAppServerPreflightScenarioEvidence,
): CodexAppServerPreflightScenarioEvidence {
  return {
    ...value,
    threadStatusTransitions: value.threadStatusTransitions.map((transition) => ({
      type: transition.type,
      ...(transition.activeFlags === undefined ? {} : { activeFlags: [...transition.activeFlags] }),
    })),
  };
}

function findScenario(
  results: readonly unknown[] | undefined,
  scenario: CODEX_APP_SERVER_PREFLIGHT_SCENARIOS,
): unknown {
  if (results === undefined) return undefined;
  const denseResults = requireDenseArray(results, "scenarioResults");
  if (denseResults.length !== 2) throw new Error("scenarioResults 必须精确包含两个场景");
  let selected: unknown;
  for (const item of denseResults) {
    requirePlainRecord(item, "scenario result");
    if (item["scenario"] === scenario) {
      if (selected !== undefined) throw new Error(`${scenario} scenario evidence 重复`);
      selected = item;
    }
  }
  return selected;
}

function assertAllowedInputKeys(input: Record<string, unknown>): void {
  const allowed = new Set([
    "codexExecutableDigest",
    "codexVersion",
    "positive",
    "negative",
    "scenarioResults",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`preflight input 包含未知字段 ${key}`);
  }
}

function calculateEvidenceDigest(value: unknown): string {
  return `sha256:${calculateRfc8785JsonSha256(value)}`;
}
