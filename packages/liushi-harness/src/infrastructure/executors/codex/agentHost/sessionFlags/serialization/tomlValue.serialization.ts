import { isPlainRecord, readDenseDataArray } from "../validation/index.js";

const BARE_TOML_KEY = /^[A-Za-z0-9_-]+$/u;

/** 将受限 TOML 内联值确定性编码为 Codex `-c` 所需的值。 */
export function serializeTomlValue(value: unknown): string {
  return serializeValue(value, new WeakSet<object>());
}

function serializeValue(value: unknown, stack: WeakSet<object>): string {
  if (typeof value === "string") {
    return serializeTomlBasicString(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Session Flags 仅支持确定性的 TOML 字符串、布尔值、安全整数、数组和对象。");
  }
  if (stack.has(value)) {
    throw new Error("Session Flags 拒绝循环 TOML 值。");
  }

  stack.add(value);
  try {
    if (Array.isArray(value)) {
      return serializeArray(value, stack);
    }
    if (isPlainRecord(value)) {
      return serializeObject(value, stack);
    }
    throw new Error("Session Flags 拒绝非 plain object TOML 值。");
  } finally {
    stack.delete(value);
  }
}

function serializeArray(value: readonly unknown[], stack: WeakSet<object>): string {
  const elements = readDenseDataArray(value, "Session Flags array");
  const serialized: string[] = [];
  for (const element of elements) {
    serialized.push(serializeValue(element, stack));
  }
  return `[${serialized.join(",")}]`;
}

function serializeObject(value: Record<string, unknown>, stack: WeakSet<object>): string {
  const keys: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new Error("Session Flags 不支持 Symbol 字段。");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      throw new Error("Session Flags 拒绝访问器字段。");
    }
    if (descriptor === undefined || !descriptor.enumerable) {
      throw new Error("Session Flags 拒绝 non-enumerable 字段。");
    }
    keys.push(key);
  }

  return `{${keys
    .sort()
    .map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
        throw new Error("Session Flags 拒绝访问器字段。");
      }
      return `${serializeTomlKey(key)}=${serializeValue(descriptor.value, stack)}`;
    })
    .join(",")}}`;
}

function serializeTomlKey(key: string): string {
  return BARE_TOML_KEY.test(key) ? key : serializeTomlBasicString(key);
}

function serializeTomlBasicString(value: string): string {
  let encoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        throw new Error("Session Flags 拒绝孤立 UTF-16 surrogate。");
      }
      encoded += value[index]! + value[index + 1]!;
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error("Session Flags 拒绝孤立 UTF-16 surrogate。");
    }
    if (codeUnit === 0x08) {
      encoded += "\\b";
    } else if (codeUnit === 0x09) {
      encoded += "\\t";
    } else if (codeUnit === 0x0a) {
      encoded += "\\n";
    } else if (codeUnit === 0x0c) {
      encoded += "\\f";
    } else if (codeUnit === 0x0d) {
      encoded += "\\r";
    } else if (codeUnit === 0x22) {
      encoded += '\\"';
    } else if (codeUnit === 0x5c) {
      encoded += "\\\\";
    } else if ((codeUnit >= 0 && codeUnit <= 0x1f) || codeUnit === 0x7f) {
      encoded += `\\u${codeUnit.toString(16).padStart(4, "0").toUpperCase()}`;
    } else {
      encoded += value[index]!;
    }
  }
  return `"${encoded}"`;
}
