import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { NodeHookInputReaderAdapter } from "../../src/infrastructure/hookInputReader/index.js";
import type { HookInputReader } from "../../src/presentation/index.js";

describe("NodeHookInputReaderAdapter", () => {
  it("以结构类型满足 Presentation 契约并合并分块 JSON", async () => {
    const reader: HookInputReader = new NodeHookInputReaderAdapter(
      createChunkSource([
        Buffer.from('{"hook_event_'),
        'name":"PreToolUse",',
        Buffer.from('"tool_name":"apply_patch"}'),
      ]),
    );

    const result = await reader.read();

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: { hook_event_name: "PreToolUse", tool_name: "apply_patch" },
    });
  });

  it.each([
    ["空输入", []],
    ["非法 JSON", ["{invalid"]],
    ["非法分块类型", [42]],
  ] as const)("%s 返回关闭式错误", async (_label, chunks) => {
    const result = await new NodeHookInputReaderAdapter(createChunkSource(chunks)).read();

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
  });
});

function createChunkSource(chunks: readonly unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const chunk of chunks) yield chunk;
    },
  };
}
