import { Buffer } from "node:buffer";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

/** 从 Node.js 异步字节流读取并解析一次完整 Hook JSON 输入。 */
export class NodeHookInputReaderAdapter {
  /** 默认读取进程标准输入；Contract Suite 可注入隔离的异步分块来源。 */
  public constructor(private readonly source: AsyncIterable<unknown> = process.stdin) {}

  /** 合并全部分块后一次性解析 JSON，任何读取或解析异常均关闭式失败。 */
  public async read(): Promise<Result<unknown, HarnessError>> {
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of this.source) {
        const normalized = normalizeChunk(chunk);
        if (normalized.status === ResultStatus.Failure) return normalized;
        chunks.push(normalized.value);
      }
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "无法读取 Hook 标准输入。", {}, error),
      );
    }

    const content = Buffer.concat(chunks).toString("utf8");
    if (content.trim().length === 0) {
      return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Hook 标准输入为空。"));
    }
    try {
      return success(JSON.parse(content) as unknown);
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Hook 标准输入不是合法 JSON。", {}, error),
      );
    }
  }
}

function normalizeChunk(chunk: unknown): Result<Buffer, HarnessError> {
  if (typeof chunk === "string") return success(Buffer.from(chunk, "utf8"));
  if (chunk instanceof Uint8Array) return success(Buffer.from(chunk));
  return failure(
    new HarnessError(HarnessErrorCode.InvalidInput, "Hook 标准输入包含不支持的分块类型。"),
  );
}
