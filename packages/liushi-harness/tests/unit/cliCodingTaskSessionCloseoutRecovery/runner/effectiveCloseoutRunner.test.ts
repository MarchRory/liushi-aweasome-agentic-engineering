import { describe, expect, it, vi } from "vitest";

import { CodingTaskSessionEffectiveCloseoutStatus } from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { executeCodingTaskSessionEffectiveCloseout } from "../../../../src/presentation/cli/runner/commands/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_SUCCESS,
} from "../../../../src/presentation/cli/constants/index.js";
import { HarnessError, HarnessErrorCode, failure, success } from "../../../../src/index.js";
import { createEffectiveCommand, createRunnerSetup } from "./runnerFixture.js";

describe("Effective Closeout CLI runner", () => {
  it.each([
    CodingTaskSessionEffectiveCloseoutStatus.Resolved,
    CodingTaskSessionEffectiveCloseoutStatus.Unresolved,
  ])("按 status 映射结果：%s", async (status) => {
    const execute = vi.fn(() => Promise.resolve(success({ status })));
    const setup = createRunnerSetup({
      resolveCodingTaskSessionEffectiveCloseout: { resolve: execute },
    });

    const exitCode = await executeCodingTaskSessionEffectiveCloseout(
      createEffectiveCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(
      status === CodingTaskSessionEffectiveCloseoutStatus.Resolved
        ? CLI_EXIT_CODE_SUCCESS
        : CLI_EXIT_CODE_CONFLICT,
    );
    expect(execute).toHaveBeenCalledWith({ workspaceId: "workspace-1", sessionId: "session-1" });
    expect(setup.stdout).toHaveBeenCalled();
  });

  it("Application Failure 写入 failure 并映射错误码", async () => {
    const resolve = vi.fn(() =>
      Promise.resolve(failure(new HarnessError(HarnessErrorCode.IoFailure, "effective failed"))),
    );
    const setup = createRunnerSetup({ resolveCodingTaskSessionEffectiveCloseout: { resolve } });

    const exitCode = await executeCodingTaskSessionEffectiveCloseout(
      createEffectiveCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_IO_FAILURE);
    expect(setup.stderr).toHaveBeenCalled();
  });
});
