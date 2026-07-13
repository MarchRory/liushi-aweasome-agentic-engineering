import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
  CodingTaskCellStatus,
  success,
} from "../../src/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CliCommand,
  CliResponseStatus,
  CliVerificationMode,
  runCli,
  type CliApplication,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

describe("CodingTask Cell CLI", () => {
  it("ReviewReady 使用 JSON success 与 exit 0", async () => {
    const setup = createSetup(CodingTaskCellStatus.ReviewReady);

    const exitCode = await runCli(cellArgs(), setup.dependencies);

    expect(exitCode).toBe(0);
    expect(setup.stderr).toBe("");
    expect(JSON.parse(setup.stdout)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.CellRun,
      data: {
        schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
        status: CodingTaskCellStatus.ReviewReady,
        receipts: [],
      },
    });
    expect(setup.createApplication).toHaveBeenCalledWith(".runtime", {
      repositoryBinding: {
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot: resolve("repository"),
      },
      verificationMode: CliVerificationMode.FailClosedMock,
    });
  });

  it.each([CodingTaskCellStatus.Blocked, CodingTaskCellStatus.OutcomeUnknown])(
    "%s 使用 JSON blocked 与 conflict exit",
    async (status) => {
      const setup = createSetup(status);

      const exitCode = await runCli(cellArgs(), setup.dependencies);

      expect(exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
      expect(setup.stderr).toBe("");
      expect(JSON.parse(setup.stdout)).toMatchObject({
        status: CliResponseStatus.Blocked,
        command: CliCommand.CellRun,
        data: {
          schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
          status,
          receipts: [],
        },
      });
    },
  );
});

function createSetup(status: CodingTaskCellStatus) {
  let stdout = "";
  let stderr = "";
  const execute = vi.fn(() =>
    Promise.resolve(
      success({
        schemaVersion: CODING_TASK_CELL_REPORT_SCHEMA_VERSION,
        status,
        receipts: [],
      }),
    ),
  );
  const application = {
    runCodingTaskCell: { execute },
  } as unknown as CliApplication;
  const createApplication = vi.fn(() => application);
  const dependencies: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: createApplication },
    writer: {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
    jsonDocumentReader: { read: () => Promise.resolve(success({ schemaVersion: "manifest" })) },
  };
  return {
    dependencies,
    createApplication,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

function cellArgs(): string[] {
  return [
    "cell",
    "run",
    "--file",
    "cell.json",
    "--workspace",
    "workspace-1",
    "--repository",
    "repository-1",
    "--root",
    resolve("repository"),
    "--verification-mode",
    CliVerificationMode.FailClosedMock,
    "--json",
  ];
}
