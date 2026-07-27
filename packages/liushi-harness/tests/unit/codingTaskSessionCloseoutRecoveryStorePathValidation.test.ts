import { describe, expect, it, vi } from "vitest";

const fileSystemMocks = vi.hoisted(() => ({
  lstat: vi.fn(),
  realpath: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    lstat: fileSystemMocks.lstat,
    realpath: fileSystemMocks.realpath,
  };
});

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  createStore,
  recoveryLocator,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";

describe("Closeout Recovery Store 路径错误分类", () => {
  it("祖先目录 lstat 的非 ENOENT 错误映射为 IoFailure", async () => {
    fileSystemMocks.lstat
      .mockResolvedValueOnce({
        isDirectory: () => true,
        isSymbolicLink: () => false,
      })
      .mockRejectedValueOnce(Object.assign(new Error("access denied"), { code: "EACCES" }));
    fileSystemMocks.realpath.mockImplementationOnce((path: string) => Promise.resolve(path));

    const result = await createStore("D:/runtime").find(recoveryLocator);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
  });
});
