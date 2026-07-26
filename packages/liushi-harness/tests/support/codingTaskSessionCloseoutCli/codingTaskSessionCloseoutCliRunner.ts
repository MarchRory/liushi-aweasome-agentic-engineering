import { readFile } from "node:fs/promises";

import {
  CliCommand,
  CliResponseStatus,
  NodeJsonDocumentReaderAdapter,
  runCli,
} from "../../../src/presentation/index.js";
import { createProductionCliApplicationFactory } from "../../../src/bootstrap/cli/index.js";

import type {
  CodingTaskSessionCloseoutCliEnvelope,
  CodingTaskSessionCloseoutCliRun,
  CodingTaskSessionCloseoutCliRunOverrides,
  CodingTaskSessionCloseoutCliSetup,
  CodingTaskSessionCloseoutEvidenceBytes,
} from "./codingTaskSessionCloseoutCliContracts.js";

/** 使用新的生产 Application 实例执行一次 Closeout CLI。 */
export async function runCloseoutCli(
  setup: CodingTaskSessionCloseoutCliSetup,
  overrides: CodingTaskSessionCloseoutCliRunOverrides = {},
): Promise<CodingTaskSessionCloseoutCliRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(
    [
      "coding-task",
      "session",
      "closeout",
      "--file",
      overrides.closeoutCommandFile ?? setup.closeoutCommandFile,
      "--workspace",
      setup.workspaceId,
      "--repository",
      overrides.repositoryId ?? setup.repositoryId,
      "--root",
      overrides.repositoryRoot ?? setup.repositoryRoot,
      "--actor-id",
      overrides.agentActorId ?? setup.agentActorId,
      "--store",
      setup.storeRoot,
      "--json",
    ],
    {
      defaultStoreRoot: setup.storeRoot,
      applicationFactory: createProductionCliApplicationFactory(),
      writer: {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      },
      jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    },
  );
  return { exitCode, stdout, stderr };
}

/** 解析唯一 JSON stdout，并验证 Closeout 成功命令身份。 */
export function parseCloseoutCliOutput(
  result: CodingTaskSessionCloseoutCliRun,
): CodingTaskSessionCloseoutCliEnvelope {
  if (result.stdout.length !== 1)
    throw new Error(`Closeout stdout 不是单一 JSON：${result.stdout.join("")}`);
  const parsed = JSON.parse(result.stdout[0]!) as CodingTaskSessionCloseoutCliEnvelope;
  if (parsed.command !== CliCommand.CodingTaskSessionCloseout) {
    throw new Error(`Closeout 输出命令错误：${parsed.command}。`);
  }
  if (parsed.status !== CliResponseStatus.Success) {
    throw new Error(`Closeout 输出未成功：${JSON.stringify(parsed)}。`);
  }
  return parsed;
}

/** 读取 Closeout 前后不应变化的关键持久化证据原始字节。 */
export async function readCloseoutCliEvidence(
  setup: CodingTaskSessionCloseoutCliSetup,
): Promise<CodingTaskSessionCloseoutEvidenceBytes> {
  const entries = await Promise.all(
    setup.evidenceFiles.map(async (file) => [file, await readFile(file, "utf8")] as const),
  );
  return Object.fromEntries(entries);
}

/** 读取 Closeout State 的固定状态字段。 */
export function closeoutStatus(output: CodingTaskSessionCloseoutCliEnvelope): string {
  const status = output.data["status"];
  if (typeof status !== "string") throw new Error("Closeout 输出缺少 status。");
  return status;
}

/** 验证本次真实 Git 运行的基础状态读取成功。 */
export function assertSuccessfulRun(result: CodingTaskSessionCloseoutCliRun): void {
  if (result.exitCode !== 0 || result.stderr.length !== 0) {
    throw new Error(`Closeout CLI 失败：${JSON.stringify(result)}。`);
  }
  if (result.stdout.length !== 1) throw new Error("Closeout CLI 未输出单一 JSON。");
}
