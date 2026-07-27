import { describe, expect, it } from "vitest";

import * as effectiveCloseoutPublicApi from "../../src/application/codingTaskSessionCloseoutRecovery/effectiveResolver/index.js";

describe("Effective Closeout Resolver public API", () => {
  it("只公开 Resolver、结果枚举与类型契约", () => {
    expect(Object.keys(effectiveCloseoutPublicApi).sort()).toEqual(
      [
        "CodingTaskSessionEffectiveCloseoutResolver",
        "CodingTaskSessionEffectiveCloseoutSource",
        "CodingTaskSessionEffectiveCloseoutStatus",
        "CodingTaskSessionEffectiveCloseoutUnresolvedReason",
      ].sort(),
    );
  });
});
