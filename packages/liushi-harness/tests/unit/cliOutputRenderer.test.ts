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

  it.each([
    HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound,
    HarnessErrorCode.ExecutorCompatibilityMatrixNotFound,
  ])("为 %s 映射 NotFound 退出码", (errorCode) => {
    expect(mapErrorExitCode(errorCode)).toBe(3);
  });

  it("为 Executor Compatibility 提交结果未知映射独立退出码", () => {
    expect(mapErrorExitCode(HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown)).toBe(
      CLI_EXIT_CODE_OUTCOME_UNKNOWN,
    );
  });

  it.each([
    HarnessErrorCode.CodingTaskSessionCloseoutRecoveryCommitOutcomeUnknown,
    HarnessErrorCode.CodingTaskSessionCloseoutRecoveryLockReleaseUnknown,
  ])("为 %s 映射禁止自动重试的退出码", (errorCode) => {
    expect(mapErrorExitCode(errorCode)).toBe(CLI_EXIT_CODE_OUTCOME_UNKNOWN);
  });
});
