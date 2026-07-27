import { describe, expect, it } from "vitest";

import {
  CliCommand,
  CliOutputFormat,
  CliResponseStatus,
} from "../../../../src/presentation/cli/contracts/index.js";
import {
  writeBlocked,
  writeFailure,
  writeSuccess,
} from "../../../../src/presentation/cli/output/index.js";
import { CLI_OUTPUT_SCHEMA_VERSION } from "../../../../src/presentation/cli/constants/index.js";
import type { RunCliDependencies } from "../../../../src/presentation/cli/contracts/index.js";
import { HarnessError, HarnessErrorCode } from "../../../../src/common/index.js";

describe("CodingTask Session Closeout Recovery CLI 输出摘要", () => {
  it.each([
    [
      CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
      {
        assessmentDigest: "assessment-digest",
        disposition: "recoverable",
        allowedResolution: "retry_once",
        diagnostic: "checkpoint_mismatch",
        evidenceIds: ["evidence-1"],
        repositoryRoot: "D:\\private-repository",
        worktreeRoot: "D:\\private-worktree",
        payload: { secret: "raw-payload" },
      },
    ],
    [
      CliCommand.CodingTaskSessionCloseoutRecover,
      {
        commandId: "command-1",
        status: "committed",
        committedVersion: 7,
        errorCode: null,
        requestDigest: "request-digest",
        errorMessage: "private error message",
        authorizationContext: { secret: "private-authorization" },
        payload: { secret: "raw-payload" },
      },
    ],
    [
      CliCommand.CodingTaskSessionEffectiveCloseout,
      {
        status: "resolved",
        source: "original",
        checkpoint: {
          bindingDigest: "checkpoint-digest",
          changedPaths: ["D:\\private-file"],
          absolutePath: "D:\\private-file",
          secret: "raw-checkpoint",
        },
        reason: null,
      },
    ],
  ])("%s 的 Human success 与 blocked 均只输出稳定字段", (command, data) => {
    const successOutput = render((dependencies) =>
      writeSuccess(dependencies, CliOutputFormat.Human, command, data),
    );
    const blockedOutput = render((dependencies) =>
      writeBlocked(dependencies, CliOutputFormat.Human, command, data),
    );

    expect(successOutput).toBe(blockedOutput);
    if (command === CliCommand.CodingTaskSessionCloseoutRecoveryAssess) {
      expect(successOutput).toContain(
        "assessmentDigest=assessment-digest disposition=recoverable allowedResolution=retry_once diagnostic=checkpoint_mismatch",
      );
    }
    if (command === CliCommand.CodingTaskSessionCloseoutRecover) {
      expect(successOutput).toContain(
        "commandId=command-1 status=committed committedVersion=7 errorCode=none",
      );
    }
    if (command === CliCommand.CodingTaskSessionEffectiveCloseout) {
      expect(successOutput).toContain(
        "status=resolved source=original reason=none checkpoint.bindingDigest=checkpoint-digest",
      );
    }
    expect(successOutput).not.toContain("evidence-1");
    expect(successOutput).not.toContain("private-repository");
    expect(successOutput).not.toContain("private-worktree");
    expect(successOutput).not.toContain("request-digest");
    expect(successOutput).not.toContain("private error message");
    expect(successOutput).not.toContain("raw-payload");
    expect(successOutput).not.toContain("private-authorization");
    expect(successOutput).not.toContain("raw-checkpoint");
  });

  it.each([
    CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
    CliCommand.CodingTaskSessionCloseoutRecover,
    CliCommand.CodingTaskSessionEffectiveCloseout,
  ])("%s 的 JSON success 与 blocked 保留 1.0 envelope 和 data", (command) => {
    const data = { status: "domain-status", privatePayload: "kept-in-json" };
    const successOutput = render((dependencies) =>
      writeSuccess(dependencies, CliOutputFormat.Json, command, data),
    );
    const blockedOutput = render((dependencies) =>
      writeBlocked(dependencies, CliOutputFormat.Json, command, data),
    );

    expect(JSON.parse(successOutput)).toEqual({
      schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      status: CliResponseStatus.Success,
      command,
      data,
    });
    expect(JSON.parse(blockedOutput)).toEqual({
      schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      status: CliResponseStatus.Blocked,
      command,
      data,
    });
  });

  it.each([
    CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
    CliCommand.CodingTaskSessionCloseoutRecover,
    CliCommand.CodingTaskSessionEffectiveCloseout,
  ])("%s 的 Human failure 不输出诊断 details", (command) => {
    let output = "";
    const dependencies = {
      writer: { stdout: () => undefined, stderr: (value: string) => (output += value) },
    } as unknown as RunCliDependencies;
    const error = new HarnessError(HarnessErrorCode.IoFailure, "Recovery command failed.", {
      filePath: "D:\\private-repository\\command.json",
      evidenceId: "private-evidence",
    });

    writeFailure(dependencies, CliOutputFormat.Human, command, error);

    expect(output).toBe("ERROR [io_failure] Recovery command failed.\n");
    expect(output).not.toContain("private-repository");
    expect(output).not.toContain("private-evidence");
  });

  it("抽取既有 CodingTask 摘要后保持原有 Human 文本", () => {
    expect(
      render((dependencies) =>
        writeSuccess(dependencies, CliOutputFormat.Human, CliCommand.CellRun, {
          status: "completed",
          stoppedStage: undefined,
          receipts: ["receipt"],
        }),
      ),
    ).toBe("CodingTask cell: status=completed stoppedStage=none receipts=1.\n");
    expect(
      render((dependencies) =>
        writeSuccess(dependencies, CliOutputFormat.Human, CliCommand.CodingTaskSessionActivate, {
          status: "waiting_agent",
          stoppedStage: undefined,
          receipts: [],
          worktreeRoot: "D:\\worktree",
        }),
      ),
    ).toBe(
      "CodingTask session activation: status=waiting_agent stoppedStage=none receipts=0 worktreeRoot=D:\\worktree.\n",
    );
    expect(
      render((dependencies) =>
        writeSuccess(dependencies, CliOutputFormat.Human, CliCommand.CodingTaskSessionCloseout, {
          status: "checkpoint_bound",
          stoppedStage: null,
          version: 2,
          snapshot: {},
          coverageManifest: {},
          checkpoint: {},
          errorCode: null,
        }),
      ),
    ).toBe(
      "CodingTask session closeout: status=checkpoint_bound stoppedStage=none version=2 snapshot=true coverage=true checkpoint=true errorCode=none.\n",
    );
  });
});

function render(operation: (dependencies: RunCliDependencies) => void): string {
  let output = "";
  const dependencies = {
    writer: { stdout: (value: string) => (output += value), stderr: () => undefined },
  } as unknown as RunCliDependencies;
  operation(dependencies);
  return output;
}
