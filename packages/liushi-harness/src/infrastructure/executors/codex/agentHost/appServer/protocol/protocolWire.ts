import { CodexAppServerError, type CodexAppServerWireRecord } from "../contracts/index.js";
import type {
  CodexAppServerProtocolState,
  CodexAppServerProtocolContext,
} from "./protocolState.js";
import {
  CODEX_APP_SERVER_GRANT_ROOT_FIELDS,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_METHODS,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
} from "../enums/index.js";

const SAFE_ITEM_TYPES = new Set<CODEX_APP_SERVER_ITEM_TYPES>([
  CODEX_APP_SERVER_ITEM_TYPES.AgentMessage,
  CODEX_APP_SERVER_ITEM_TYPES.ContextCompaction,
  CODEX_APP_SERVER_ITEM_TYPES.HookPrompt,
  CODEX_APP_SERVER_ITEM_TYPES.Plan,
  CODEX_APP_SERVER_ITEM_TYPES.Reasoning,
  CODEX_APP_SERVER_ITEM_TYPES.UserMessage,
]);

const SAFE_PROGRESS_METHODS = new Set<string>([
  CODEX_APP_SERVER_METHODS.TurnDiffUpdated,
  CODEX_APP_SERVER_METHODS.ThreadTokenUsageUpdated,
  CODEX_APP_SERVER_METHODS.AgentMessageDelta,
  CODEX_APP_SERVER_METHODS.PlanDelta,
  CODEX_APP_SERVER_METHODS.ReasoningSummaryTextDelta,
  CODEX_APP_SERVER_METHODS.ReasoningTextDelta,
]);

const KNOWN_METHODS = new Set<string>(Object.values(CODEX_APP_SERVER_METHODS));

/** 判断 Item 类型是否属于受限协议允许的非文件集合。 */
export function isSafeItemType(value: unknown): value is CODEX_APP_SERVER_ITEM_TYPES {
  return typeof value === "string" && SAFE_ITEM_TYPES.has(value as CODEX_APP_SERVER_ITEM_TYPES);
}

/** 判断通知方法是否属于允许忽略正文的进度集合。 */
export function isSafeProgressNotification(method: string): boolean {
  return SAFE_PROGRESS_METHODS.has(method);
}

/** 记录方法计数并保留未知方法名称。 */
export function recordMethod(state: CodexAppServerProtocolState, method: string): void {
  if (!KNOWN_METHODS.has(method)) {
    state.unknownMethodCount += 1;
    state.unknownMethods.add(method);
    return;
  }
  state.methodCounts.set(method, (state.methodCounts.get(method) ?? 0) + 1);
}

/** 校验服务端方法名称的基础边界。 */
export function requireMethod(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw createProtocolError("server method is invalid");
  }
  return value;
}

/** 校验并返回协议中的非空标识符。 */
export function requireIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes("\0")
  ) {
    throw createProtocolError(`${label} is invalid`);
  }
  return value;
}

/** 判断 JSON-RPC 请求编号是否有效。 */
export function isRpcId(value: unknown): value is string | number {
  return (
    (typeof value === "string" && value.length > 0 && value.length <= 512) ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

/** 要求协议字段是非数组对象记录。 */
export function requireRecord(value: unknown, label: string): CodexAppServerWireRecord {
  if (!isRecord(value)) throw createProtocolError(`${label} is invalid`);
  return value;
}

/** 把未知异常规范化为正式协议错误。 */
export function asProtocolError(error: unknown): CodexAppServerError {
  if (error instanceof CodexAppServerError) return error;
  return new CodexAppServerError(error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}

/** 创建带有协议错误语义的正式错误。 */
export function createProtocolError(message: string, cause?: unknown): CodexAppServerError {
  return new CodexAppServerError(message, { cause });
}

/** 从线程或线程响应记录读取线程编号。 */
export function readThreadId(value: unknown): unknown {
  const record = isRecord(value) ? value : {};
  const nested = isRecord(record.thread) ? record.thread.id : undefined;
  if (record.threadId !== undefined && nested !== undefined && record.threadId !== nested) {
    throw createProtocolError("thread ids in one message did not match");
  }
  return record.threadId ?? nested;
}

/** 从 Turn 或 Turn 响应记录读取 Turn 编号。 */
export function readTurnId(value: unknown): unknown {
  const record = isRecord(value) ? value : {};
  const nested = isRecord(record.turn) ? record.turn.id : undefined;
  if (record.turnId !== undefined && nested !== undefined && record.turnId !== nested) {
    throw createProtocolError("turn ids in one message did not match");
  }
  return record.turnId ?? nested;
}

/** 从 Turn 或 Turn 响应记录读取 Turn 状态。 */
export function readTurnStatus(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const turn = isRecord(value.turn) ? value.turn : undefined;
  return value.status ?? turn?.status;
}

/** 注册线程编号并拒绝身份漂移。 */
export function registerThreadId(
  context: CodexAppServerProtocolContext,
  value: unknown,
  label: string,
): void {
  const threadId = requireIdentifier(value, `${label}.threadId`);
  if (context.state.threadId !== null && context.state.threadId !== threadId) {
    throw createProtocolError("multiple thread ids were observed");
  }
  context.state.threadId = threadId;
}

/** 注册 Turn 编号并拒绝身份漂移。 */
export function registerTurnId(
  context: CodexAppServerProtocolContext,
  value: unknown,
  label: string,
): void {
  const turnId = requireIdentifier(value, `${label}.turnId`);
  if (context.state.turnId !== null && context.state.turnId !== turnId) {
    throw createProtocolError("multiple turn ids were observed");
  }
  context.state.turnId = turnId;
}

/** 校验消息中的线程和 Turn 身份与当前上下文一致。 */
export function assertContext(
  context: CodexAppServerProtocolContext,
  threadId: string,
  turnId: string,
  label: string,
): void {
  if (context.state.threadId === null || context.state.turnId === null) {
    throw createProtocolError(`${label} arrived before thread/turn identity was established`);
  }
  if (threadId !== context.state.threadId || turnId !== context.state.turnId) {
    throw createProtocolError(`${label} thread/turn identity did not match`);
  }
}

/** 要求线程与 Turn 均已按响应、started 通知的顺序进入运行态。 */
export function assertTurnLifecycleStarted(
  context: CodexAppServerProtocolContext,
  label: string,
): void {
  if (
    context.state.phase !== CODEX_APP_SERVER_PROTOCOL_PHASES.Running ||
    !context.state.threadStarted ||
    !context.state.turnStarted ||
    context.state.threadId === null ||
    context.state.turnId === null
  ) {
    throw createProtocolError(`${label} arrived before the thread/turn lifecycle started`);
  }
}

/** 校验可选的线程和 Turn 上下文。 */
export function assertOptionalContext(
  context: CodexAppServerProtocolContext,
  params: unknown,
  label: string,
): void {
  if (!isRecord(params)) return;
  if (params.threadId !== undefined || params.turnId !== undefined) {
    const threadId = requireIdentifier(params.threadId, `${label}.threadId`);
    const turnId = requireIdentifier(params.turnId, `${label}.turnId`);
    assertContext(context, threadId, turnId, label);
  }
}

/** 校验可选 Item 编号与消息主体一致。 */
export function assertOptionalItemId(
  params: CodexAppServerWireRecord,
  itemId: string,
  label: string,
): void {
  if (params.itemId !== undefined) {
    const suppliedItemId = requireIdentifier(params.itemId, `${label}.itemId`);
    if (suppliedItemId !== itemId) throw createProtocolError(`${label} item id did not match`);
  }
}

/** 拒绝非空的授权根字段。 */
export function assertGrantRootIsEmpty(params: CodexAppServerWireRecord): void {
  for (const key of Object.values(CODEX_APP_SERVER_GRANT_ROOT_FIELDS)) {
    if (Object.hasOwn(params, key) && params[key] !== undefined && params[key] !== null) {
      throw createProtocolError("grantRoot must be null or omitted");
    }
  }
}

/** 判断对象是否只含指定字段。 */
export function hasExactKeys(value: CodexAppServerWireRecord, expectedKeys: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
}

/** 判断对象是否为普通原型记录。 */
export function isPlainRecord(value: unknown): value is CodexAppServerWireRecord {
  if (!isRecord(value)) return false;
  try {
    const prototype: object | null = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/** 判断值是否为非数组对象记录。 */
export function isRecord(value: unknown): value is CodexAppServerWireRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
