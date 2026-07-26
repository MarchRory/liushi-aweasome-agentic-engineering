import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    lstat: vi.fn(() =>
      Promise.reject(Object.assign(new Error("access denied"), { code: "EACCES" })),
    ),
  };
});

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { isCodingTaskSessionCloseoutStatePresent } from "../../src/infrastructure/persistence/fileCodingTaskSessionCloseoutStore/validation/index.js";

describe("CodingTaskSessionCloseout Store 路径错误分类", () => {
  it("State lstat 的非 ENOENT 错误映射为 IoFailure", async () => {
    const result = await isCodingTaskSessionCloseoutStatePresent("D:/runtime/state.json");

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
  });
});
