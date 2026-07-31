import type { CodexAppServerThreadStatusTransition } from "../../appServer/contracts/index.js";
import { CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS } from "../../appServer/constants/index.js";
import { CODEX_MODEL_PROVIDER_ID } from "../../sessionFlags/constants/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS,
  CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODES,
  CODEX_APP_SERVER_PREFLIGHT_RESULTS,
  CODEX_APP_SERVER_PREFLIGHT_SCENARIOS,
  CODEX_APP_SERVER_PREFLIGHT_SSE_EVENTS,
} from "../enums/index.js";

/** 正式 App Server Preflight 证据 schema。 */
export const CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION =
  "liushi.codex-agent-host.app-server-preflight.v1";
export const CODEX_PREFLIGHT_EVIDENCE_SCHEMA_VERSION = CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION;

/** Preflight 临时根目录描述 schema。 */
export const CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION =
  "liushi.codex-agent-host.preflight-root.v1";
export const CODEX_PREFLIGHT_ROOT_DESCRIPTOR_SCHEMA_VERSION =
  CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION;
export const CODEX_PREFLIGHT_ROOT_SCHEMA_VERSION = CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION;

/** 本次正式化只接受的 Codex 版本。 */
export const CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION = "codex-cli 0.145.0";
export const CODEX_PREFLIGHT_VERSION = CODEX_APP_SERVER_PREFLIGHT_CODEX_VERSION;

/** Runner 的固定资源限制，必须逐字段写入证据。 */
export const CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  outputLimitBytes: 1_024 * 1_024,
  stderrLimitBytes: 64 * 1_024,
  terminationConfirmationTimeoutMs: 1_000,
});
export const CODEX_PREFLIGHT_RUNNER_LIMITS = CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS;

/** 本地 Responses 传输的固定审计字段。 */
export const CODEX_APP_SERVER_PREFLIGHT_TRANSPORT = Object.freeze({
  providerId: CODEX_MODEL_PROVIDER_ID,
  supportsWebsockets: false,
  websocketAttempts: 0,
  reconnectAttempts: 0,
});

/** Preflight 的固定执行模式。 */
export const CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODE =
  CODEX_APP_SERVER_PREFLIGHT_EXECUTION_MODES.AppServerFileChangeApproval;

/** Preflight 只使用合成授权，绝不代表真实 Human Approval。 */
export const CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGIN =
  CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS.SyntheticPreflight;

/** 进程与真实模型请求计数的固定值。 */
export const CODEX_APP_SERVER_PREFLIGHT_PROCESS_COUNT = 2;
export const CODEX_APP_SERVER_PREFLIGHT_REAL_MODEL_REQUEST_COUNT = 0;
export const CODEX_PREFLIGHT_PROCESS_COUNT = CODEX_APP_SERVER_PREFLIGHT_PROCESS_COUNT;
export const CODEX_PREFLIGHT_REAL_MODEL_REQUEST_COUNT =
  CODEX_APP_SERVER_PREFLIGHT_REAL_MODEL_REQUEST_COUNT;

/** 四段完整的 thread transition，直接复用 App Server 权威常量。 */
export const CODEX_APP_SERVER_PREFLIGHT_THREAD_TRANSITIONS: readonly CodexAppServerThreadStatusTransition[] =
  CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS;

/** 每个场景的 Responses 请求数。 */
export const CODEX_APP_SERVER_PREFLIGHT_RESPONSES_REQUEST_COUNTS = Object.freeze({
  [CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate]: 2,
  [CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.OutOfSetUpdate]: 1,
});
export const CODEX_PREFLIGHT_EXPECTED_RESPONSES_REQUEST_COUNT =
  CODEX_APP_SERVER_PREFLIGHT_RESPONSES_REQUEST_COUNTS;

/** 每个场景的完成响应数。 */
export const CODEX_APP_SERVER_PREFLIGHT_COMPLETED_RESPONSE_COUNTS = Object.freeze({
  [CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate]: 2,
  [CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.OutOfSetUpdate]: 1,
});

/** 临时根目录、所有权标记与场景文件的固定名称。 */
export const CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX = "liushi-codex-app-server-preflight-";
export const CODEX_PREFLIGHT_OWNER_MARKER = CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION;
export const CODEX_PREFLIGHT_OWNER_FILE = ".liushi-codex-app-server-preflight-owner";
export const CODEX_PREFLIGHT_TARGET_FILE = "target.txt";
export const CODEX_PREFLIGHT_OUT_OF_SET_FILE = "outOfSet.txt";
export const CODEX_PREFLIGHT_INITIAL_CONTENT = "preflight-original\n";
export const CODEX_PREFLIGHT_UPDATED_CONTENT = "preflight-updated\n";
export const CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT = "preflight-out-of-set-original\n";
export const CODEX_PREFLIGHT_OUT_OF_SET_UPDATED_CONTENT = "preflight-out-of-set-updated\n";
export const CODEX_PREFLIGHT_OUT_OF_SET_CONTENT = CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT;
export const CODEX_PREFLIGHT_TARGET_INITIAL_CONTENT = CODEX_PREFLIGHT_INITIAL_CONTENT;
export const CODEX_PREFLIGHT_TARGET_UPDATED_CONTENT = CODEX_PREFLIGHT_UPDATED_CONTENT;

/** 场景目录必须由本映射产生，避免编排层自行拼接名称。 */
export const CODEX_PREFLIGHT_SCENARIO_DIRECTORIES = Object.freeze({
  [CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.AllowedUpdate]: "allowed-update",
  [CODEX_APP_SERVER_PREFLIGHT_SCENARIOS.OutOfSetUpdate]: "out-of-set-update",
});

/** 发送给 Codex 的固定零模型 Prompt。 */
export const CODEX_PREFLIGHT_PROMPT =
  "Apply the single proposed file change and finish without any other tool call.";

/** 本地 Responses 请求体上限。 */
export const CODEX_PREFLIGHT_REQUEST_BODY_LIMIT_BYTES = 256 * 1_024;

/** 固定 Codex 版本发出的 Responses 请求 Content-Type。 */
export const CODEX_PREFLIGHT_RESPONSES_CONTENT_TYPE = "application/json";

/** 固定 Codex 版本发出的 Responses 请求字段闭集。 */
export const CODEX_PREFLIGHT_RESPONSES_REQUEST_KEYS = Object.freeze([
  "client_metadata",
  "include",
  "input",
  "model",
  "parallel_tool_calls",
  "prompt_cache_key",
  "reasoning",
  "store",
  "stream",
  "text",
  "tool_choice",
] as const);

/** 本地 Responses 服务关闭确认期限。 */
export const CODEX_PREFLIGHT_SERVER_CLOSE_DEADLINE_MS = 1_000;
export const CODEX_PREFLIGHT_SERVER_CLOSE_TIMEOUT_MS = CODEX_PREFLIGHT_SERVER_CLOSE_DEADLINE_MS;
export const CODEX_PREFLIGHT_CLOSE_DEADLINE_MS = CODEX_PREFLIGHT_SERVER_CLOSE_DEADLINE_MS;

/** 本地 SSE 事件名称，供 Responses worker 直接复用。 */
export const CODEX_PREFLIGHT_SSE_EVENTS = CODEX_APP_SERVER_PREFLIGHT_SSE_EVENTS;
export const CODEX_PREFLIGHT_SCENARIOS = CODEX_APP_SERVER_PREFLIGHT_SCENARIOS;
export const CODEX_PREFLIGHT_RESULTS = CODEX_APP_SERVER_PREFLIGHT_RESULTS;

/** 进程基础环境的明确白名单，不包含凭据、证书或代理值。 */
export const CODEX_PREFLIGHT_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_ARCHITEW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
] as const);
export const CODEX_PREFLIGHT_ENVIRONMENT_NAMES = CODEX_PREFLIGHT_ENVIRONMENT_ALLOWLIST;

/** 所有代理变量的强制空值集合。 */
export const CODEX_PREFLIGHT_PROXY_VARIABLES = Object.freeze([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const);

/** 仅允许 loopback 的代理例外。 */
export const CODEX_PREFLIGHT_LOOPBACK_NO_PROXY = "127.0.0.1,localhost,::1";
