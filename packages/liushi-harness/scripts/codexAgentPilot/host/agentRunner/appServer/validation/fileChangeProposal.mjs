import {
  CODEX_APP_SERVER_CHANGE_KINDS,
  CODEX_APP_SERVER_ITEM_STATUSES,
  CODEX_APP_SERVER_ITEM_TYPES,
  CODEX_APP_SERVER_MOVE_PATH_FIELDS,
} from "../codexAppServerConstants.mjs";
import { normalizeAbsolutePath, pathIdentity } from "../platform/index.mjs";

export function normalizeFileChangeItem(item, allowedPaths, label = "fileChange item") {
  if (!isRecord(item)) throw new Error(`${label} must be an object`);
  if (
    item.type !== CODEX_APP_SERVER_ITEM_TYPES.FileChange &&
    item.type !== CODEX_APP_SERVER_ITEM_TYPES.FileChangeLegacy
  ) {
    throw new Error(`${label} must be a fileChange item`);
  }
  const id = requireIdentifier(item.id, `${label}.id`);
  if (
    item.status !== undefined &&
    !Object.values(CODEX_APP_SERVER_ITEM_STATUSES).includes(item.status)
  ) {
    throw new Error(`${label}.status is invalid`);
  }
  if (
    item.status !== undefined &&
    item.status !== CODEX_APP_SERVER_ITEM_STATUSES.InProgress &&
    item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Completed &&
    item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Failed &&
    item.status !== CODEX_APP_SERVER_ITEM_STATUSES.Declined
  ) {
    throw new Error(`${label}.status is invalid`);
  }

  return {
    id,
    type: CODEX_APP_SERVER_ITEM_TYPES.FileChange,
    status: item.status,
    changes: normalizeChanges(item.changes, allowedPaths, `${label}.changes`),
  };
}

export function normalizeChanges(changes, allowedPaths, label = "changes") {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error(`${label} must contain at least one change`);
  }

  const seen = new Set();
  const normalized = [];
  for (const change of changes) {
    if (!isRecord(change)) throw new Error(`${label} contains an invalid change`);
    const path = normalizeAbsolutePath(change.path, `${label}.path`);
    const identity = pathIdentity(path);
    if (seen.has(identity)) throw new Error(`${label} must not repeat a path`);
    if (!allowedPaths.has(identity))
      throw new Error(`${label} contains a path outside the allowlist`);
    seen.add(identity);

    if (!isRecord(change.kind) || change.kind.type !== CODEX_APP_SERVER_CHANGE_KINDS.Update) {
      throw new Error(`${label} only supports update changes`);
    }
    assertMovePathIsEmpty(change.kind, label);
    assertMovePathIsEmpty(change, label);
    normalized.push({ path, kind: CODEX_APP_SERVER_CHANGE_KINDS.Update });
  }
  return normalized;
}

export function createFileChangeProposal(threadId, turnId, item) {
  return {
    threadId,
    turnId,
    itemId: item.id,
    changes: item.changes.map((change) => ({ ...change })),
    grantRoot: null,
  };
}

export function changesEqual(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every(
      (change, index) => change?.path === right[index]?.path && change?.kind === right[index]?.kind,
    )
  );
}

function assertMovePathIsEmpty(change, label) {
  for (const key of Object.values(CODEX_APP_SERVER_MOVE_PATH_FIELDS)) {
    if (Object.hasOwn(change, key) && change[key] !== undefined && change[key] !== null) {
      throw new Error(`${label} does not support move paths`);
    }
  }
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a non-empty identifier without NUL`);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
