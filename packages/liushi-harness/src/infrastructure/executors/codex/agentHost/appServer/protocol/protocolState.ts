import type { Hash } from "node:crypto";

import type {
  CodexAppServerConfig,
  CodexAppServerError,
  CodexAppServerIo,
  CodexAppServerNormalizedFileChangeItem,
  CodexAppServerProtocolEvidence,
  CodexAppServerThreadStatusTransition,
} from "../contracts/index.js";
import type {
  CODEX_APP_SERVER_APPROVAL_DECISIONS,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_OUTCOMES,
  CODEX_APP_SERVER_PROTOCOL_PHASES,
  CODEX_APP_SERVER_TERMINATION_REASONS,
} from "../enums/index.js";
import type {
  CodexAppServerApprovalState,
  CodexAppServerFileItemState,
  CODEX_APP_SERVER_METHODS,
} from "../enums/index.js";

/** 已发出但尚未收到响应的客户端请求记录。 */
export interface CodexAppServerPendingRequest {
  /** 请求使用的方法。 */
  readonly method: CODEX_APP_SERVER_METHODS;
}

/** 文件变更 Item 的协议状态记录。 */
export interface CodexAppServerFileChangeRecord {
  /** Item 类别。 */
  readonly kind: CodexAppServerFileItemState.FileChange;
  /** Item 编号。 */
  readonly id: string;
  /** 校验后的文件变更 Item。 */
  normalized: CodexAppServerNormalizedFileChangeItem | null;
  /** 提案校验失败时的正式错误。 */
  invalidError: CodexAppServerError | null;
  /** 当前审批状态。 */
  approval: CodexAppServerApprovalState | null;
  /** 是否已收到匹配的 Item 完成通知。 */
  completed: boolean;
}

/** 非文件变更 Item 的协议状态记录。 */
export interface CodexAppServerOtherItemRecord {
  /** Item 类别。 */
  readonly kind: CodexAppServerFileItemState.Other;
  /** Item 编号。 */
  readonly id: string;
  /** 已允许的 Item 类型。 */
  readonly type: CODEX_APP_SERVER_ITEM_TYPES;
  /** 是否已收到匹配的 Item 完成通知。 */
  completed: boolean;
}

/** 协议消费期间保存的 Item 状态。 */
export type CodexAppServerItemRecord =
  CodexAppServerFileChangeRecord | CodexAppServerOtherItemRecord;

/** App Server 受限协议的全部运行状态。 */
export interface CodexAppServerProtocolState {
  /** 当前协议阶段。 */
  phase: CODEX_APP_SERVER_PROTOCOL_PHASES;
  /** 尚未完成的客户端请求。 */
  pendingRequests: Map<number, CodexAppServerPendingRequest>;
  /** 已响应的服务端请求编号。 */
  respondedServerRequestIds: Set<string | number>;
  /** 已收到完成通知的服务端请求编号。 */
  resolvedServerRequestIds: Set<string | number>;
  /** 已确认的线程编号。 */
  threadId: string | null;
  /** 已确认的 Turn 编号。 */
  turnId: string | null;
  /** 是否收到 thread/started。 */
  threadStarted: boolean;
  /** 是否收到 turn/started。 */
  turnStarted: boolean;
  /** 是否收到 turn/completed。 */
  turnCompleted: boolean;
  /** 所有已开始 Item。 */
  items: Map<string, CodexAppServerItemRecord>;
  /** 已开始的文件变更 Item。 */
  fileChangeItems: Map<string, CodexAppServerFileChangeRecord>;
  /** 已观察到的文件路径身份。 */
  changePaths: Set<string>;
  /** 是否有审批回调正在执行。 */
  approvalInFlight: boolean;
  /** 是否处于等待审批状态。 */
  approvalWaitActive: boolean;
  /** 是否观察到等待审批状态被清除。 */
  approvalWaitCleared: boolean;
  /** 是否观察到等待审批状态。 */
  approvalWaitObserved: boolean;
  /** 是否观察到最终 idle 状态。 */
  idleObserved: boolean;
  /** 是否发生明确策略拒绝。 */
  policyDenied: boolean;
  /** 协议正式失败。 */
  failure: CodexAppServerError | null;
  /** 已确定的 Turn 结果。 */
  outcome: CODEX_APP_SERVER_OUTCOMES | null;
  /** 接收的 JSONL 事件数。 */
  eventCount: number;
  /** 接收的响应数。 */
  responseCount: number;
  /** 接收的服务端请求数。 */
  requestCount: number;
  /** 接收的通知数。 */
  notificationCount: number;
  /** 已知方法计数。 */
  methodCounts: Map<string, number>;
  /** 未知方法计数。 */
  unknownMethodCount: number;
  /** 未知方法名称。 */
  unknownMethods: Set<string>;
  /** 已完成文件变更数量。 */
  completedFileChangeCount: number;
  /** 已接受审批数量。 */
  approvedCount: number;
  /** 已取消审批数量。 */
  cancelledCount: number;
  /** 授权摘要集合。 */
  authorizations: Array<{
    /** 被审批的 Item 编号。 */
    itemId: string;
    /** 发给 App Server 的决策。 */
    decision: CODEX_APP_SERVER_APPROVAL_DECISIONS;
    /** 审计证据摘要。 */
    evidenceDigest: string;
  }>;
  /** 线程状态变化序列。 */
  threadStatusTransitions: CodexAppServerThreadStatusTransition[];
  /** 规范化变更集合的增量摘要器。 */
  changeDigest: Hash;
}

/** 协议处理函数共享的上下文。 */
export interface CodexAppServerProtocolContext {
  /** 已校验的 Runner 配置。 */
  readonly config: CodexAppServerConfig;
  /** 子进程 IO。 */
  readonly io: CodexAppServerIo;
  /** 可变协议状态。 */
  readonly state: CodexAppServerProtocolState;
  /** 把协议错误转交进程层。 */
  readonly fail: (error: unknown, reason?: CODEX_APP_SERVER_TERMINATION_REASONS) => void;
}

/** 创建受限协议的初始状态。 */
export function createCodexAppServerProtocolState(
  changeDigest: Hash,
  phase: CODEX_APP_SERVER_PROTOCOL_PHASES,
): CodexAppServerProtocolState {
  return {
    phase,
    pendingRequests: new Map(),
    respondedServerRequestIds: new Set(),
    resolvedServerRequestIds: new Set(),
    threadId: null,
    turnId: null,
    threadStarted: false,
    turnStarted: false,
    turnCompleted: false,
    items: new Map(),
    fileChangeItems: new Map(),
    changePaths: new Set(),
    approvalInFlight: false,
    approvalWaitActive: false,
    approvalWaitCleared: false,
    approvalWaitObserved: false,
    idleObserved: false,
    policyDenied: false,
    failure: null,
    outcome: null,
    eventCount: 0,
    responseCount: 0,
    requestCount: 0,
    notificationCount: 0,
    methodCounts: new Map(),
    unknownMethodCount: 0,
    unknownMethods: new Set(),
    completedFileChangeCount: 0,
    approvedCount: 0,
    cancelledCount: 0,
    authorizations: [],
    threadStatusTransitions: [],
    changeDigest,
  };
}

/** 把协议状态转换为不含敏感正文的公开证据。 */
export function createProtocolEvidence(
  state: CodexAppServerProtocolState,
): CodexAppServerProtocolEvidence {
  return {
    threadId: state.threadId,
    turnId: state.turnId,
    eventCount: state.eventCount,
    responseCount: state.responseCount,
    requestCount: state.requestCount,
    notificationCount: state.notificationCount,
    methodCounts: Object.fromEntries([...state.methodCounts.entries()].sort()),
    unknownMethodCount: state.unknownMethodCount,
    unknownMethods: [...state.unknownMethods].sort(),
    itemCount: state.items.size,
    fileChangeItemCount: state.fileChangeItems.size,
    completedFileChangeCount: state.completedFileChangeCount,
    approvedCount: state.approvedCount,
    cancelledCount: state.cancelledCount,
    authorizations: [...state.authorizations]
      .sort(compareAuthorizationItemIds)
      .map((authorization) => ({ ...authorization })),
    threadStatusTransitions: state.threadStatusTransitions.map(cloneThreadStatusTransition),
    changeDigest: state.changeDigest.copy().digest("hex"),
  };
}

function compareAuthorizationItemIds(left: { itemId: string }, right: { itemId: string }): number {
  if (left.itemId < right.itemId) return -1;
  if (left.itemId > right.itemId) return 1;
  return 0;
}

function cloneThreadStatusTransition(
  transition: CodexAppServerThreadStatusTransition,
): CodexAppServerThreadStatusTransition {
  return transition.activeFlags === undefined
    ? { type: transition.type }
    : { type: transition.type, activeFlags: [...transition.activeFlags] };
}
