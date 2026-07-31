import { CodexAppServerError } from "../contracts/index.js";
import {
  asProtocolError,
  assertContext,
  assertOptionalItemId,
  assertTurnLifecycleStarted,
  createProtocolError,
  isSafeItemType,
  requireIdentifier,
  requireRecord,
} from "./protocolWire.js";
import {
  CodexAppServerApprovalState,
  CodexAppServerFileItemState,
  CODEX_APP_SERVER_ITEM_STATUSES,
  CODEX_APP_SERVER_ITEM_TYPES,
} from "../enums/index.js";
import type { CodexAppServerWireRecord } from "../contracts/index.js";
import { changesEqual, normalizeChanges, normalizeFileChangeItem } from "../validation/index.js";
import { pathIdentity } from "../platform/index.js";
import type {
  CodexAppServerFileChangeRecord,
  CodexAppServerProtocolContext,
} from "./protocolState.js";

/** 处理 item/started 通知并建立 Item 状态记录。 */
export function handleItemStarted(
  context: CodexAppServerProtocolContext,
  params: CodexAppServerWireRecord,
): void {
  assertTurnLifecycleStarted(context, "item/started");
  const threadId = requireIdentifier(params.threadId, "item/started threadId");
  const turnId = requireIdentifier(params.turnId, "item/started turnId");
  assertContext(context, threadId, turnId, "item/started");
  const item = requireRecord(params.item, "item/started item");
  const itemId = requireIdentifier(item.id, "item/started item.id");
  assertOptionalItemId(params, itemId, "item/started");
  if (context.state.items.has(itemId)) throw createProtocolError("item/started was repeated");

  if (
    item.type === CODEX_APP_SERVER_ITEM_TYPES.FileChange ||
    item.type === CODEX_APP_SERVER_ITEM_TYPES.FileChangeLegacy
  ) {
    let normalized = null;
    let invalidError = null;
    try {
      normalized = normalizeFileChangeItem(item, context.config.allowedPaths);
      for (const change of normalized.changes) {
        const identity = pathIdentity(change.path);
        if (context.state.changePaths.has(identity)) {
          throw createProtocolError("file change path was repeated");
        }
        context.state.changePaths.add(identity);
        context.state.changeDigest.update(JSON.stringify(change));
      }
    } catch (error) {
      invalidError = asProtocolError(error);
    }
    const record: CodexAppServerFileChangeRecord = {
      kind: CodexAppServerFileItemState.FileChange,
      id: itemId,
      normalized,
      invalidError,
      approval: null,
      completed: false,
    };
    context.state.items.set(itemId, record);
    context.state.fileChangeItems.set(itemId, record);
    return;
  }

  if (!isSafeItemType(item.type)) {
    throw createProtocolError("unsupported item type was emitted");
  }
  context.state.items.set(itemId, {
    kind: CodexAppServerFileItemState.Other,
    id: itemId,
    type: item.type,
    completed: false,
  });
}

/** 处理 item/completed 通知并验证 Item 生命周期。 */
export function handleItemCompleted(
  context: CodexAppServerProtocolContext,
  params: CodexAppServerWireRecord,
): void {
  assertTurnLifecycleStarted(context, "item/completed");
  const threadId = requireIdentifier(params.threadId, "item/completed threadId");
  const turnId = requireIdentifier(params.turnId, "item/completed turnId");
  assertContext(context, threadId, turnId, "item/completed");
  const item = requireRecord(params.item, "item/completed item");
  const itemId = requireIdentifier(item.id, "item/completed item.id");
  assertOptionalItemId(params, itemId, "item/completed");
  const record = context.state.items.get(itemId);
  if (record === undefined || record.completed) {
    throw createProtocolError("item/completed did not match one started item");
  }

  if (record.kind === CodexAppServerFileItemState.FileChange) {
    if (record.invalidError !== null) {
      throw new CodexAppServerError("item/completed file change was invalid", {
        cause: record.invalidError,
      });
    }
    if (record.normalized === null) {
      throw createProtocolError("item/completed file change was not normalized");
    }
    const normalized = normalizeFileChangeItem(
      item,
      context.config.allowedPaths,
      "item/completed item",
    );
    if (!changesEqual(record.normalized.changes, normalized.changes)) {
      throw createProtocolError("item/completed changes did not match item/started");
    }
    if (record.approval === CodexAppServerApprovalState.Accepted) {
      if (item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Completed) {
        throw createProtocolError("approved file change did not complete successfully");
      }
    } else if (record.approval === null) {
      throw createProtocolError("file change completed without an approval decision");
    } else if (
      item.status === CODEX_APP_SERVER_ITEM_STATUSES.Completed ||
      (item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Failed &&
        item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Declined)
    ) {
      throw createProtocolError("cancelled file change had an invalid terminal status");
    }
    record.completed = true;
    context.state.completedFileChangeCount += 1;
    return;
  }

  if (item.type !== record.type) throw createProtocolError("item/completed type did not match");
  record.completed = true;
}

/** 处理文件变更补丁更新通知并锁定已审批路径集合。 */
export function handleFileChangePatchUpdated(
  context: CodexAppServerProtocolContext,
  params: CodexAppServerWireRecord,
): void {
  const threadId = requireIdentifier(params.threadId, "file change patch threadId");
  const turnId = requireIdentifier(params.turnId, "file change patch turnId");
  const itemId = requireIdentifier(params.itemId, "file change patch itemId");
  assertContext(context, threadId, turnId, "file change patch");
  const record = context.state.fileChangeItems.get(itemId);
  if (record === undefined) throw createProtocolError("file change patch has no prior item");
  const changes = normalizeChanges(
    params.changes,
    context.config.allowedPaths,
    "file change patch changes",
  );
  if (record.normalized === null || !changesEqual(record.normalized.changes, changes)) {
    throw createProtocolError("file change patch changed the approved path set");
  }
}
