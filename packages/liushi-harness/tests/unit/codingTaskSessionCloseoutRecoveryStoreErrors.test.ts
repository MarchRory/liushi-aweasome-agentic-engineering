import { describe, expect, it } from "vitest";

import { HarnessError, HarnessErrorCode } from "../../src/common/index.js";
import { asCodingTaskSessionCloseoutRecoveryReadError } from "../../src/infrastructure/persistence/fileCodingTaskSessionCloseoutRecoveryStore/errors/index.js";

describe("Closeout Recovery Store 错误分类", () => {
  it.each([HarnessErrorCode.IoFailure, HarnessErrorCode.PreconditionNotMet] as const)(
    "保留严格读取的运行时错误：%s",
    (code) => {
      const source = new HarnessError(code, "injected runtime failure");

      expect(asCodingTaskSessionCloseoutRecoveryReadError(source)).toBe(source);
    },
  );

  it("将内容格式错误映射为 CorruptStore 并保留 cause", () => {
    const source = new HarnessError(HarnessErrorCode.InvalidInput, "injected invalid content");
    const classified = asCodingTaskSessionCloseoutRecoveryReadError(source);

    expect(classified).toMatchObject({ code: HarnessErrorCode.CorruptStore });
    expect(classified.cause).toBe(source);
  });
});
