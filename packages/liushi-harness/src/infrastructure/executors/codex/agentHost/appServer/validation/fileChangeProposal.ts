import {
  CODEX_APP_SERVER_CHANGE_KINDS,
  CODEX_APP_SERVER_ITEM_STATUSES,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_MOVE_PATH_FIELDS,
} from "../enums/index.js";
import type {
  CodexAppServerNormalizedChange,
  CodexAppServerNormalizedFileChangeItem,
  CodexAppServerFileChangeProposal,
  CodexAppServerWireRecord,
} from "../contracts/index.js";
import { normalizeAbsolutePath, pathIdentity } from "../platform/index.js";

/** 校验并规范化一个文件变更 Item。 */
export function normalizeFileChangeItem(
  item: unknown,
  allowedPaths: ReadonlyMap<string, string>,
  label = "fileChange item",
): CodexAppServerNormalizedFileChangeItem {
  const record = requireRecord(item, label);
  if (
    record.type !== CODEX_APP_SERVER_ITEM_TYPES.FileChange &&
    record.type !== CODEX_APP_SERVER_ITEM_TYPES.FileChangeLegacy
  ) {
    throw new Error(`${label} must be a fileChange item`);
  }
  const id = requireIdentifier(record.id, `${label}.id`);
  const status = record.status;
  if (status !== undefined && !isItemStatus(status)) {
    throw new Error(`${label}.status is invalid`);
  }

  return {
    id,
    type: CODEX_APP_SERVER_ITEM_TYPES.FileChange,
    status,
    changes: normalizeChanges(record.changes, allowedPaths, `${label}.changes`),
  };
}

/** 校验并规范化一组文件变更。 */
export function normalizeChanges(
  changes: unknown,
  allowedPaths: ReadonlyMap<string, string>,
  label = "changes",
): CodexAppServerNormalizedChange[] {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error(`${label} must contain at least one change`);
  }

  const seen = new Set<string>();
  const normalized: CodexAppServerNormalizedChange[] = [];
  for (const change of changes) {
    const record = requireRecord(change, `${label} change`);
    const path = normalizeAbsolutePath(record.path, `${label}.path`);
    const identity = pathIdentity(path);
    if (seen.has(identity)) throw new Error(`${label} must not repeat a path`);
    if (!allowedPaths.has(identity)) {
      throw new Error(`${label} contains a path outside the allowlist`);
    }
    seen.add(identity);

    const kind = requireRecord(record.kind, `${label}.kind`);
    if (kind.type !== CODEX_APP_SERVER_CHANGE_KINDS.Update) {
      throw new Error(`${label} only supports update changes`);
    }
    assertMovePathIsEmpty(kind, label);
    assertMovePathIsEmpty(record, label);
    normalized.push({ path, kind: CODEX_APP_SERVER_CHANGE_KINDS.Update });
  }
  return normalized;
}

/** 从规范化 Item 创建 Human Gate 提案。 */
export function createFileChangeProposal(
  threadId: string,
  turnId: string,
  item: CodexAppServerNormalizedFileChangeItem,
): CodexAppServerFileChangeProposal {
  return {
    threadId,
    turnId,
    itemId: item.id,
    changes: item.changes.map((change) => ({ ...change })),
    grantRoot: null,
  };
}

/** 判断两个规范化文件变更集合是否逐项一致。 */
export function changesEqual(left: unknown, right: unknown): boolean {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((change, index) => {
      const other: unknown = right[index];
      return (
        isRecord(change) &&
        isRecord(other) &&
        change.path === other.path &&
        change.kind === other.kind
      );
    })
  );
}

function assertMovePathIsEmpty(record: CodexAppServerWireRecord, label: string): void {
  for (const key of Object.values(CODEX_APP_SERVER_MOVE_PATH_FIELDS)) {
    if (Object.hasOwn(record, key) && record[key] !== undefined && record[key] !== null) {
      throw new Error(`${label} does not support move paths`);
    }
  }
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty identifier without NUL`);
  }
  return value;
}

function isItemStatus(value: unknown): value is CODEX_APP_SERVER_ITEM_STATUSES {
  return Object.values(CODEX_APP_SERVER_ITEM_STATUSES).includes(
    value as CODEX_APP_SERVER_ITEM_STATUSES,
  );
}

function requireRecord(value: unknown, label: string): CodexAppServerWireRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is CodexAppServerWireRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
