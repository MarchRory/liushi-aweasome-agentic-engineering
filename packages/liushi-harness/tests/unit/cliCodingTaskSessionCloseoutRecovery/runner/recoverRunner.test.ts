import { describe, expect, it, vi } from "vitest";

import { CommandErrorCode, CommandStatus } from "../../../../src/application/command/index.js";
import { executeCodingTaskSessionCloseoutRecoveryRecover } from "../../../../src/presentation/cli/runner/commands/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_OUTCOME_UNKNOWN,
  CLI_EXIT_CODE_SUCCESS,
  CLI_EXIT_CODE_UNAVAILABLE,
} from "../../../../src/presentation/cli/constants/index.js";
import { HarnessError, HarnessErrorCode, failure, success } from "../../../../src/index.js";
import { boundDocument, createRecoverCommand, createRunnerSetup } from "./runnerFixture.js";

describe("Closeout Recovery Human Command CLI runner", () => {
  it("JSON reader Failure 不调用 Application", async () => {
    const execute = vi.fn();
    const setup = createRunnerSetup(
      { recoverCodingTaskSessionCloseout: { execute } },
      undefined,
      failure(new HarnessError(HarnessErrorCode.IoFailure, "read failed")),
    );

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryRecover(
      createRecoverCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_IO_FAILURE);
    expect(execute).not.toHaveBeenCalled();
    expect(setup.read).toHaveBeenCalledWith("human-command.json");
  });

  it.each([
    ["actor", { actor: { actorId: "other" } }],
    ["workspace", { payload: { workspaceId: "other", sessionId: "session-1" } }],
    ["session", { payload: { workspaceId: "workspace-1", sessionId: "other" } }],
  ])("%s mismatch 不调用 Application", async (_name, mismatch) => {
    const execute = vi.fn();
    const setup = createRunnerSetup(
      { recoverCodingTaskSessionCloseout: { execute } },
      { ...boundDocument(), ...mismatch },
    );

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryRecover(
      createRecoverCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(execute).not.toHaveBeenCalled();
    expect(setup.stderr).toHaveBeenCalled();
  });

  it("非字符串绑定字段交由严格 Command parser 分类", async () => {
    const document = {
      actor: { actorId: 1 },
      payload: { workspaceId: false, sessionId: null },
    };
    const execute = vi.fn(() =>
      Promise.resolve(
        success({
          status: CommandStatus.Rejected,
          errorCode: CommandErrorCode.InvalidEnvelope,
        }),
      ),
    );
    const setup = createRunnerSetup({ recoverCodingTaskSessionCloseout: { execute } }, document);

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryRecover(
      createRecoverCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(execute).toHaveBeenCalledWith(document);
  });

  it.each([
    [CommandStatus.Committed, undefined, CLI_EXIT_CODE_SUCCESS],
    [CommandStatus.Duplicate, undefined, CLI_EXIT_CODE_SUCCESS],
    [CommandStatus.OutcomeUnknown, CommandErrorCode.OutcomeUnknown, CLI_EXIT_CODE_OUTCOME_UNKNOWN],
    [CommandStatus.Rejected, CommandErrorCode.ResourceUnavailable, CLI_EXIT_CODE_UNAVAILABLE],
    [CommandStatus.Conflict, CommandErrorCode.VersionConflict, CLI_EXIT_CODE_CONFLICT],
    [CommandStatus.Rejected, CommandErrorCode.AuthorizationDenied, CLI_EXIT_CODE_CONFLICT],
  ] as const)("Receipt %s 映射为退出码 %s", async (status, errorCode, expectedExitCode) => {
    const execute = vi.fn(() =>
      Promise.resolve(success({ status, ...(errorCode ? { errorCode } : {}) })),
    );
    const document = boundDocument();
    const setup = createRunnerSetup({ recoverCodingTaskSessionCloseout: { execute } }, document);

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryRecover(
      createRecoverCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(expectedExitCode);
    expect(execute).toHaveBeenCalledWith(document);
    expect(setup.stdout).toHaveBeenCalled();
  });

  it("Application Failure 写入 failure 并映射错误码", async () => {
    const execute = vi.fn(() =>
      Promise.resolve(failure(new HarnessError(HarnessErrorCode.IoFailure, "recover failed"))),
    );
    const setup = createRunnerSetup({ recoverCodingTaskSessionCloseout: { execute } });

    const exitCode = await executeCodingTaskSessionCloseoutRecoveryRecover(
      createRecoverCommand(),
      setup.dependencies.applicationFactory.create(".runtime"),
      setup.dependencies,
    );

    expect(exitCode).toBe(CLI_EXIT_CODE_IO_FAILURE);
    expect(setup.stderr).toHaveBeenCalled();
  });
});
