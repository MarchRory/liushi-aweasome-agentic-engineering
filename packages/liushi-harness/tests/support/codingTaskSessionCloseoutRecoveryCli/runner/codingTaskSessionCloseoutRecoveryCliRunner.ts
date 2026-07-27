import {
  CliResponseStatus,
  NodeJsonDocumentReaderAdapter,
} from "../../../../src/presentation/index.js";
import type { CliCommand } from "../../../../src/presentation/index.js";
import { CLI_OUTPUT_SCHEMA_VERSION } from "../../../../src/presentation/cli/constants/index.js";
import { createProductionCliApplicationFactory } from "../../../../src/bootstrap/cli/index.js";
import { runCli } from "../../../../src/presentation/index.js";

import type { CodingTaskSessionCloseoutCliRun } from "../../codingTaskSessionCloseoutCli/index.js";
import type { CloseoutRecoveryCliData, CloseoutRecoveryCliSetup } from "../contracts/index.js";

/** 运行 production Closeout Recovery Assessment CLI。 */
export function runCloseoutRecoveryAssessCli(
  setup: CloseoutRecoveryCliSetup,
): Promise<CodingTaskSessionCloseoutCliRun> {
  return runCloseoutRecoveryCli(setup, [
    "coding-task",
    "session",
    "closeout",
    "assess",
    "--workspace",
    setup.workspaceId,
    "--session",
    setup.sessionId,
    "--repository",
    setup.repositoryId,
    "--root",
    setup.repositoryRoot,
    "--store",
    setup.storeRoot,
    "--json",
  ]);
}

/** 运行 production Human Recovery CLI。 */
export function runCloseoutRecoveryRecoverCli(
  setup: CloseoutRecoveryCliSetup,
  commandFile: string,
  actorId: string,
): Promise<CodingTaskSessionCloseoutCliRun> {
  return runCloseoutRecoveryCli(setup, [
    "coding-task",
    "session",
    "closeout",
    "recover",
    "--file",
    commandFile,
    "--workspace",
    setup.workspaceId,
    "--session",
    setup.sessionId,
    "--repository",
    setup.repositoryId,
    "--root",
    setup.repositoryRoot,
    "--actor-id",
    actorId,
    "--store",
    setup.storeRoot,
    "--json",
  ]);
}

/** 运行 production Effective Closeout CLI。 */
export function runCloseoutRecoveryEffectiveCli(
  setup: CloseoutRecoveryCliSetup,
): Promise<CodingTaskSessionCloseoutCliRun> {
  return runCloseoutRecoveryCli(setup, [
    "coding-task",
    "session",
    "closeout",
    "effective",
    "--workspace",
    setup.workspaceId,
    "--session",
    setup.sessionId,
    "--store",
    setup.storeRoot,
    "--json",
  ]);
}

/** 解析并严格确认一个成功的 CLI 1.0.0 JSON Envelope。 */
export function parseCloseoutRecoverySuccess(
  result: CodingTaskSessionCloseoutCliRun,
  command: CliCommand,
): CloseoutRecoveryCliData {
  if (result.exitCode !== 0 || result.stderr.length !== 0 || result.stdout.length !== 1) {
    throw new Error(`Recovery CLI 运行失败：${JSON.stringify(result)}`);
  }
  const parsed: unknown = JSON.parse(result.stdout[0]!);
  if (!isRecord(parsed)) throw new Error("Recovery CLI 输出不是 JSON 对象。");
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "command,data,schemaVersion,status") {
    throw new Error("Recovery CLI 输出不是严格 1.0.0 Envelope。");
  }
  if (
    parsed["schemaVersion"] !== CLI_OUTPUT_SCHEMA_VERSION ||
    parsed["status"] !== CliResponseStatus.Success ||
    parsed["command"] !== command ||
    !isRecord(parsed["data"])
  ) {
    throw new Error(`Recovery CLI 成功 Envelope 校验失败：${JSON.stringify(parsed)}`);
  }
  return parsed["data"];
}

async function runCloseoutRecoveryCli(
  setup: CloseoutRecoveryCliSetup,
  args: readonly string[],
): Promise<CodingTaskSessionCloseoutCliRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, {
    defaultStoreRoot: setup.storeRoot,
    applicationFactory: createProductionCliApplicationFactory(),
    writer: {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
  });
  return { exitCode, stdout, stderr };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
