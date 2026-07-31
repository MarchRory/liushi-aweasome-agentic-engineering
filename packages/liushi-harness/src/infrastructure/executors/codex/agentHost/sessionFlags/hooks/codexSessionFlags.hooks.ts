import { CODEX_HOOK_FEATURE_OVERRIDE } from "../constants/index.js";
import { CodexHookHandlerType, CodexHookMatcher } from "../enums/index.js";
import { serializeTomlValue } from "../serialization/index.js";
import {
  assertExactKeys,
  expectedHookEvents,
  readDataProperty,
  readDenseDataArray,
  requirePlainRecord,
  validateHookTrustEntry,
} from "../validation/index.js";

/** 将受限候选 Hook 声明编码为确定性的 Session Flag overrides。 */
export function createHookDeclarationOverrides(candidateConfig: unknown): string[] {
  const candidate = requirePlainRecord(
    readDataProperty(candidateConfig, "hooks"),
    "Candidate hooks",
  );
  const expectedEvents = expectedHookEvents();
  assertExactKeys(candidate, expectedEvents, "Candidate Hook 事件集合");

  return [
    CODEX_HOOK_FEATURE_OVERRIDE,
    ...expectedEvents.map((event) => {
      const groups = readDataProperty(candidate, event);
      validateHookGroups(groups, event);
      return `hooks.${event}=${serializeTomlValue(groups)}`;
    }),
  ];
}

/** 将 Codex 返回的 Hook key 和摘要编码为确定性的临时 Trust override。 */
export function createHookTrustOverride(hooks: unknown): string {
  const hookEntries = readDenseDataArray(hooks, "Hook Trust");
  if (hookEntries.length === 0) {
    throw new Error("Hook Trust 必须绑定至少一个 Hook。");
  }

  const entries = hookEntries.map((hook) => {
    const record = requirePlainRecord(hook, "Hook Trust entry");
    assertExactKeys(record, ["key", "currentHash"], "Hook Trust entry");
    const key = readDataProperty(record, "key");
    const currentHash = readDataProperty(record, "currentHash");
    validateHookTrustEntry(key, currentHash);
    return { key: key as string, currentHash: currentHash as string };
  });

  entries.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const state = Object.create(null) as Record<string, { enabled: boolean; trusted_hash: string }>;
  for (const entry of entries) {
    if (Object.hasOwn(state, entry.key)) {
      throw new Error("Hook Trust key 不得重复。");
    }
    state[entry.key] = { enabled: true, trusted_hash: entry.currentHash };
  }
  return `hooks.state=${serializeTomlValue(state)}`;
}

function validateHookGroups(groups: unknown, event: string): void {
  const groupEntries = readDenseDataArray(groups, `${event} Hook groups`);
  if (groupEntries.length !== 1) {
    throw new Error(`${event} Hook 声明不符合固定 command 约束。`);
  }
  const group = requirePlainRecord(groupEntries[0], `${event} Hook group`);
  assertExactKeys(group, ["matcher", "hooks"], `${event} Hook group`);
  if (readDataProperty(group, "matcher") !== CodexHookMatcher.ApplyPatch) {
    throw new Error(`${event} Hook 声明不符合固定 command 约束。`);
  }

  const handlers = readDataProperty(group, "hooks");
  const handlerEntries = readDenseDataArray(handlers, `${event} Hook handlers`);
  if (handlerEntries.length !== 1) {
    throw new Error(`${event} Hook 声明不符合固定 command 约束。`);
  }
  const handler = requirePlainRecord(handlerEntries[0], `${event} Hook handler`);
  assertExactKeys(
    handler,
    ["type", "command", "commandWindows", "timeout", "statusMessage"],
    `${event} Hook handler`,
  );
  if (
    readDataProperty(handler, "type") !== CodexHookHandlerType.Command ||
    typeof readDataProperty(handler, "command") !== "string" ||
    typeof readDataProperty(handler, "commandWindows") !== "string" ||
    !Number.isSafeInteger(readDataProperty(handler, "timeout")) ||
    (readDataProperty(handler, "timeout") as number) < 0 ||
    typeof readDataProperty(handler, "statusMessage") !== "string"
  ) {
    throw new Error(`${event} Hook 声明不符合固定 command 约束。`);
  }
}
