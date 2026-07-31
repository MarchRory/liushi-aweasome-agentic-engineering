import { calculateCanonicalJsonSha256 } from "../audit/index.js";
import type {
  CodexAppServerConfig,
  CodexAppServerIo,
  CodexAppServerWireMessage,
  CodexAppServerWireRecord,
} from "../contracts/index.js";
import {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_APPROVAL_POLICY,
  CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS,
  CODEX_APP_SERVER_INPUT_TYPES,
  CODEX_APP_SERVER_PERMISSIONS,
  CodexAppServerApprovalState,
} from "../enums/index.js";
import type { CODEX_APP_SERVER_JSON_RPC_ERRORS, CODEX_APP_SERVER_METHODS } from "../enums/index.js";
import type { CodexAppServerFileChangeRecord } from "./protocolState.js";
import type { CodexAppServerProtocolContext } from "./protocolState.js";

/** 构造 thread/start 的最小兼容参数。 */
export function createThreadStartParams(config: CodexAppServerConfig): CodexAppServerWireRecord {
  return {
    model: config.model,
    modelProvider: config.modelProvider,
    cwd: config.cwd,
    runtimeWorkspaceRoots: [...config.runtimeWorkspaceRoots],
    approvalPolicy: CODEX_APP_SERVER_APPROVAL_POLICY.OnRequest,
    permissions: CODEX_APP_SERVER_PERMISSIONS.ReadOnly,
    ephemeral: true,
  };
}

/** 构造 turn/start 的最小兼容参数。 */
export function createTurnStartParams(
  config: CodexAppServerConfig,
  threadId: string | null,
): CodexAppServerWireRecord {
  return {
    threadId,
    input: [{ type: CODEX_APP_SERVER_INPUT_TYPES.Text, text: config.prompt }],
    model: config.model,
    modelProvider: config.modelProvider,
    cwd: config.cwd,
    runtimeWorkspaceRoots: [...config.runtimeWorkspaceRoots],
    approvalPolicy: CODEX_APP_SERVER_APPROVAL_POLICY.OnRequest,
    permissions: CODEX_APP_SERVER_PERMISSIONS.ReadOnly,
  };
}

/** 发送一个客户端 JSON-RPC 请求并记录其编号。 */
export function sendRequest(
  context: CodexAppServerProtocolContext,
  id: number,
  method: CODEX_APP_SERVER_METHODS,
  params: CodexAppServerWireRecord,
): void {
  if (context.state.pendingRequests.has(id)) {
    throw new Error("client request id was repeated");
  }
  context.state.pendingRequests.set(id, { method });
  sendMessage(context.io, { id, method, params });
}

/** 发送一个客户端 JSON-RPC 通知。 */
export function sendNotification(
  io: CodexAppServerIo,
  method: CODEX_APP_SERVER_METHODS,
  params: CodexAppServerWireRecord,
): void {
  sendMessage(io, { method, params });
}

/** 发送未附带审计摘要的服务端审批决策。 */
export function sendDecision(
  context: CodexAppServerProtocolContext,
  id: string | number,
  decision: CODEX_APP_SERVER_APPROVAL_DECISIONS,
): void {
  if (context.state.respondedServerRequestIds.has(id)) {
    throw new Error("server approval request was answered more than once");
  }
  context.state.respondedServerRequestIds.add(id);
  if (decision === CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel) {
    context.state.cancelledCount += 1;
  }
  sendMessage(context.io, { id, result: { decision } });
}

/** 发送审批决策并记录证据摘要。 */
export function sendAuditedDecision(
  context: CodexAppServerProtocolContext,
  id: string | number,
  itemId: string,
  decision: CODEX_APP_SERVER_APPROVAL_DECISIONS,
  evidenceDigest: string,
): void {
  sendDecision(context, id, decision);
  context.state.authorizations.push({ itemId, decision, evidenceDigest });
}

/** 回复不支持的服务端请求并保留请求编号。 */
export function sendProtocolError(
  context: CodexAppServerProtocolContext,
  id: string | number,
  code: CODEX_APP_SERVER_JSON_RPC_ERRORS,
): void {
  if (context.state.respondedServerRequestIds.has(id)) return;
  context.state.respondedServerRequestIds.add(id);
  sendMessage(context.io, {
    id,
    error: { code, message: "Unsupported app-server request" },
  });
}

/** 发送取消决策，并在任何证据异常时使用稳定原因摘要。 */
export function cancelAuthorization(
  context: CodexAppServerProtocolContext,
  id: string | number,
  item: CodexAppServerFileChangeRecord | null,
  itemId: string,
  evidence: unknown,
): void {
  let evidenceDigest: string;
  try {
    evidenceDigest = calculateCanonicalJsonSha256(evidence);
  } catch {
    evidenceDigest = calculateCanonicalJsonSha256(
      reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.InvalidEvidence),
    );
  }
  sendAuditedDecision(
    context,
    id,
    itemId,
    CODEX_APP_SERVER_APPROVAL_DECISIONS.Cancel,
    evidenceDigest,
  );
  if (item !== null) item.approval = CodexAppServerApprovalState.Denied;
}

/** 为内部拒绝构造只包含原因的审计证据。 */
export function reasonEvidence(reason: CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS): {
  reason: CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS;
} {
  return { reason };
}

/** 从批准结果中选择拒绝证据或稳定策略原因。 */
export function deniedAuthorizationEvidence(evidenceField: CodexAppServerOwnDataField): unknown {
  if (!evidenceField.present || evidenceField.value === undefined) {
    return reasonEvidence(CODEX_APP_SERVER_AUTHORIZATION_AUDIT_REASONS.PolicyDenied);
  }
  return evidenceField.value;
}

/** 读取自有数据属性，拒绝继承属性和访问器属性。 */
export function readOwnDataField(
  value: CodexAppServerWireRecord,
  key: string,
): CodexAppServerOwnDataField {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
      return { present: false, value: undefined };
    }
    return { present: true, value: descriptor.value };
  } catch {
    return { present: false, value: undefined };
  }
}

/** 自有数据属性读取结果。 */
export interface CodexAppServerOwnDataField {
  /** 是否存在自有数据属性。 */
  readonly present: boolean;
  /** 属性值。 */
  readonly value: unknown;
}

function sendMessage(io: CodexAppServerIo, message: CodexAppServerWireMessage): void {
  io.send(message);
}
