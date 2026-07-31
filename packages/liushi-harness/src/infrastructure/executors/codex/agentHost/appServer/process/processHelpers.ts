import { Buffer } from "node:buffer";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import { CodexAppServerError } from "../contracts/index.js";

/** 判断子进程是否提供可用的标准输入、输出和错误流。 */
export function hasRequiredStreams(child: unknown): child is ChildProcessWithoutNullStreams {
  if (child === null || typeof child !== "object") return false;
  const candidate = child as {
    stdin?: unknown;
    stdout?: unknown;
    stderr?: unknown;
    on?: unknown;
  };
  return (
    candidate.stdin !== null &&
    candidate.stdin !== undefined &&
    candidate.stdout !== null &&
    candidate.stdout !== undefined &&
    candidate.stderr !== null &&
    candidate.stderr !== undefined &&
    typeof (candidate.stdin as { on?: unknown }).on === "function" &&
    typeof (candidate.stdout as { on?: unknown }).on === "function" &&
    typeof (candidate.stderr as { on?: unknown }).on === "function" &&
    typeof candidate.on === "function"
  );
}

/** 把标准流数据安全转换为字节缓冲区。 */
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string" || value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("子进程标准流返回了不支持的数据类型。");
}

/** 创建带有进程状态的正式子进程错误。 */
export function createCodexAppServerProcessError(
  message: string,
  cause: unknown,
  processStarted: boolean,
  processMayBeRunning: boolean,
): CodexAppServerError {
  return new CodexAppServerError(message, {
    cause,
    processStarted,
    processMayBeRunning,
    outcomeUnknown: processMayBeRunning,
  });
}

/** 把未知异常转换为正式 Runner 错误。 */
export function asCodexAppServerError(error: unknown, message: string): CodexAppServerError {
  if (error instanceof CodexAppServerError) return error;
  return new CodexAppServerError(message, { cause: error });
}
