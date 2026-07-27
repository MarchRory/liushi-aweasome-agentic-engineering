import { describe, expect, it, vi } from "vitest";

import { CodingTaskSessionCloseoutRecoveryDisposition } from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { executeCodingTaskSessionCloseoutRecoveryAssess } from "../../../../src/presentation/cli/runner/commands/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_SUCCESS,
} from "../../../../src/presentation/cli/constants/index.js";
import { HarnessError, HarnessErrorCode, failure, success } from "../../../../src/index.js";
import { createAssessCommand, createRunnerSetup } from "./runnerFixture.js";

describe("Closeout Recovery Assessment CLI runner", () => {
  it.each([
    CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
    CodingTaskSessionCloseoutRecoveryDisposition.HumanRequired,
  ])("按 disposition 映射结果：%s", async (disposition) => {
    const execute = vi.fn(() => Promise.resolve(success({ disposition })));
    const setup = createRunnerSetup({ assessCodingTaskSessionCloseoutRecovery: { execute } });

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryAssess(
      createAssessCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(
      disposition === CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable
        ? CLI_EXIT_CODE_SUCCESS
        : CLI_EXIT_CODE_CONFLICT,
    );
    expect(execute).toHaveBeenCalledWith({ workspaceId: "workspace-1", sessionId: "session-1" });
    expect(setup.stdout).toHaveBeenCalled();
  });

  it("Application Failure 写入 failure 并映射错误码", async () => {
    const execute = vi.fn(() =>
      Promise.resolve(failure(new HarnessError(HarnessErrorCode.IoFailure, "assessment failed"))),
    );
    const setup = createRunnerSetup({ assessCodingTaskSessionCloseoutRecovery: { execute } });

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryAssess(
      createAssessCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_IO_FAILURE);
    expect(setup.stderr).toHaveBeenCalled();
  });
});
