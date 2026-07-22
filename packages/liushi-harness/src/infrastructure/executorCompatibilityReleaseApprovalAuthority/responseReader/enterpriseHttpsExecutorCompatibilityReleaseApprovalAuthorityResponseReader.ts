import type { ReadableStreamDefaultReader, ReadableStreamReadResult } from "node:stream/web";

import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_MAX_RESPONSE_BYTES } from "../constants/index.js";

/** 流式读取 Authority 回执，并在固定小型回执预算处关闭式失败。 */
export async function readEnterpriseHttpsAuthorityResponseBody(
  response: Response,
  signal: AbortSignal,
): Promise<Result<Uint8Array, HarnessError>> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    const declaredLength = Number(normalized);
    if (!/^\d+$/u.test(normalized) || !Number.isSafeInteger(declaredLength)) {
      await cancelEnterpriseHttpsAuthorityResponseBodyBestEffort(response);
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执长度无效。"),
      );
    }
    if (
      declaredLength > ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_MAX_RESPONSE_BYTES
    ) {
      await cancelEnterpriseHttpsAuthorityResponseBodyBestEffort(response);
      return failure(
        new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执超过大小上限。"),
      );
    }
  }

  if (response.body === null) {
    return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执为空。"));
  }

  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await readWithAbort(reader, signal);
      if (next.done) break;
      if (
        byteLength + next.value.byteLength >
        ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_MAX_RESPONSE_BYTES
      ) {
        await cancelBestEffort(reader);
        return failure(
          new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执超过大小上限。"),
        );
      }
      chunks.push(next.value);
      byteLength += next.value.byteLength;
    }
  } catch {
    await cancelBestEffort(reader);
    return failure(new HarnessError(HarnessErrorCode.IoFailure, "读取 Authority 回执失败。"));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 释放失败不覆盖已经确定的回执结果。
    }
  }

  if (byteLength === 0) {
    return failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执为空。"));
  }

  const content = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return success(content);
}

/** 尽力取消尚未读取的 Authority 响应体，不覆盖主校验结果。 */
export async function cancelEnterpriseHttpsAuthorityResponseBodyBestEffort(
  response: Response,
): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // cleanup 失败不能覆盖已经确定的 fail-closed 结果。
  }
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new Error("Authority 回执读取已取消。");

  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      if (!settled) {
        settled = true;
        reject(new Error("Authority 回执读取已取消。"));
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    let readPromise: Promise<ReadableStreamReadResult<Uint8Array>>;
    try {
      readPromise = reader.read();
    } catch (error: unknown) {
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error instanceof Error ? error : new Error("Authority 回执读取失败。"));
      return;
    }
    void readPromise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error("Authority 回执读取失败。"));
      },
    );
  });
}

async function cancelBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // 取消失败不允许恢复或扩大已超限的回执。
  }
}
