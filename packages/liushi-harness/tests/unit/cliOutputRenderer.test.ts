import { describe, expect, it } from "vitest";

import { HarnessErrorCode } from "../../src/common/index.js";
import { CLI_EXIT_CODE_OUTCOME_UNKNOWN } from "../../src/presentation/cli/constants/index.js";
import { mapErrorExitCode } from "../../src/presentation/cli/output/index.js";

describe("CLI 错误退出码", () => {
  it("为 Event 提交未知态保留禁止自动重试的独立退出码", () => {
    expect(mapErrorExitCode(HarnessErrorCode.EventLogCommitOutcomeUnknown)).toBe(
      CLI_EXIT_CODE_OUTCOME_UNKNOWN,
    );
  });
});
