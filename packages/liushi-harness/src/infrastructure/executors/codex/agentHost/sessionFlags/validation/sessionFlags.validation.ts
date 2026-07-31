import { CODEX_HOOK_EVENTS, CODEX_RESTRICTED_RUNTIME_OVERRIDES } from "../constants/index.js";

const DOTTED_TOML_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u;
const LINE_BREAK_OR_NUL = /[\0\r\n]/u;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;

/** 判断值是否为可安全读取的 plain object。 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** 只从数据属性读取字段，访问器字段直接拒绝。 */
export function readDataProperty(value: unknown, key: string): unknown {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    return undefined;
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    throw new Error("Session Flags 拒绝访问器字段。");
  }
  return descriptor.value;
}

/** 要求值为 plain object。 */
export function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} 必须是 plain object。`);
  }
  rejectUnsupportedOwnKeys(value);
  return value;
}

/** 要求对象只包含指定的字符串字段。 */
export function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  rejectUnsupportedOwnKeys(value);
  const actualKeys = Reflect.ownKeys(value)
    .filter((key): key is string => typeof key === "string")
    .sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpectedKeys)) {
    throw new Error(`${label} 字段集合不符合 Session Flags 约束。`);
  }
}

/** 在读取任何数组元素前，安全复制稠密数组的数据属性。 */
export function readDenseDataArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是真数组。`);
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !Object.hasOwn(lengthDescriptor, "value") ||
    typeof lengthDescriptor.value !== "number"
  ) {
    throw new Error(`${label} length 字段无效。`);
  }
  const length = lengthDescriptor.value;

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new Error(`${label} 不支持 Symbol 字段。`);
    }
    if (key === "length") {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error(`${label} 不支持访问器字段。`);
    }
    if (!isValidArrayIndexKey(key) || Number(key) >= length) {
      throw new Error(`${label} 包含非法数组字段。`);
    }
  }

  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
      throw new Error(`${label} 不支持稀疏数组。`);
    }
    result.push(descriptor.value);
  }
  return result;
}

/** 校验并读取单个 `key=TOML` override 的 key。 */
export function readConfigOverrideKey(override: unknown): string {
  if (
    typeof override !== "string" ||
    override.length === 0 ||
    LINE_BREAK_OR_NUL.test(override) ||
    !override.includes("=")
  ) {
    throw new Error("Codex Session Flag 无效。");
  }

  const key = override.slice(0, override.indexOf("=")).trim();
  if (!DOTTED_TOML_KEY.test(key)) {
    throw new Error("Codex Session Flag key 无效。");
  }
  return key;
}

/** 组装并校验确定性的 `-c key=TOML` 参数。 */
export function createConfigArguments(configOverrides: readonly string[]): string[] {
  const overrides = readStringArray(configOverrides, "Codex Session Flags");
  if (overrides.length === 0) {
    throw new Error("Codex Session Flags 不得为空。");
  }

  const keys = new Set<string>();
  const result: string[] = [];
  for (const override of overrides) {
    const key = readConfigOverrideKey(override);
    if (keys.has(key)) {
      throw new Error(`Codex Session Flag key 不得重复：${key}`);
    }
    if ([...keys].some((existingKey) => hasConfigPathConflict(existingKey, key))) {
      throw new Error(`Codex Session Flag key 不得存在父子路径冲突：${key}`);
    }
    keys.add(key);
    result.push("-c", override);
  }
  return result;
}

/** 拒绝调用方覆盖正式 Runtime keys，并附加唯一 Runtime overrides。 */
export function appendRestrictedRuntimeOverrides(configOverrides: readonly string[]): string[] {
  const overrides = readStringArray(configOverrides, "Codex Session Flags");

  const restrictedKeys = new Set(CODEX_RESTRICTED_RUNTIME_OVERRIDES.map(readConfigOverrideKey));
  for (const override of overrides) {
    const key = readConfigOverrideKey(override);
    if ([...restrictedKeys].some((restrictedKey) => hasConfigPathConflict(restrictedKey, key))) {
      throw new Error(`Codex 受限 Runtime key 不得由调用方覆盖：${key}`);
    }
  }
  return [...overrides, ...CODEX_RESTRICTED_RUNTIME_OVERRIDES];
}

/** 校验 Hook Trust 使用的 key 和 sha256 摘要。 */
export function validateHookTrustEntry(key: unknown, currentHash: unknown): void {
  if (typeof key !== "string" || key.length === 0 || typeof currentHash !== "string") {
    throw new Error("Hook Trust key 或 currentHash 无效。");
  }
  if (!SHA256_DIGEST.test(currentHash)) {
    throw new Error("Hook Trust key 或 currentHash 无效。");
  }
}

/** 校验 Hook 声明只包含固定事件集合。 */
export function expectedHookEvents(): readonly string[] {
  return [CODEX_HOOK_EVENTS.PreToolUse, CODEX_HOOK_EVENTS.PostToolUse];
}

function rejectUnsupportedOwnKeys(value: object): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new Error("Session Flags 不支持 Symbol 字段。");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      throw new Error("Session Flags 拒绝访问器字段。");
    }
  }
}

function hasConfigPathConflict(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function readStringArray(value: unknown, label: string): string[] {
  const values = readDenseDataArray(value, label);
  const result: string[] = [];
  for (const item of values) {
    if (typeof item !== "string") {
      throw new Error(`${label} 只支持字符串元素。`);
    }
    result.push(item);
  }
  return result;
}

function isValidArrayIndexKey(key: string): boolean {
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}
