import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import type { HookInputReader } from "../contracts/index.js";

/** 读取 Codex Hook 通过 Stdin 传入的一次 JSON 请求。 */
export class NodeHookInputReaderAdapter implements HookInputReader {
  /** 读取完整 Stdin，避免把分片误当成多次 Hook 请求。 */
  public async read(): Promise<Result<unknown, HarnessError>> {
    try {
      const chunks: string[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      }
      const content = chunks.join("");
      if (content.trim().length === 0) {
        return failure(new HarnessError(HarnessErrorCode.InvalidInput, "Hook stdin is empty."));
      }
      try {
        return success(JSON.parse(content) as unknown);
      } catch (error) {
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "Hook stdin is not valid JSON.",
            {},
            error,
          ),
        );
      }
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Unable to read Hook stdin.", {}, error),
      );
    }
  }
}
