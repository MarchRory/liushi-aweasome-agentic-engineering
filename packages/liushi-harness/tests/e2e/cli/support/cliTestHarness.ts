import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

import { expect } from "vitest";

import { createHarnessApplication } from "../../../../src/bootstrap/compositionRoot/index.js";
import {
  NodeJsonDocumentReaderAdapter,
  runCli,
  type CliWriter,
} from "../../../../src/presentation/index.js";

/** CLI Runner 的可观察输出。 */
export interface CommandOutput {
  /** CLI 进程语义退出码。 */
  exitCode: number;
  /** 捕获的标准输出片段。 */
  stdout: string[];
  /** 捕获的标准错误片段。 */
  stderr: string[];
}

/** 通过真实 CLI Runner 捕获 stdout、stderr 和退出码。 */
export async function runCommand(
  args: readonly string[],
  storeRoot: string,
): Promise<CommandOutput> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer: CliWriter = {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  };
  const exitCode = await runCli(args, {
    defaultStoreRoot: storeRoot,
    applicationFactory: { create: (root) => createHarnessApplication({ storeRoot: root }) },
    writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
  });
  return { exitCode, stdout, stderr };
}

/** 返回已由测试断言为单条的 CLI 输出。 */
export function singleOutput(values: readonly string[]): string {
  expect(values).toHaveLength(1);
  return values[0] as string;
}

/** 创建临时 File Event Store，并保证测试结束后清理。 */
export async function withStore(callback: (storeRoot: string) => Promise<void>): Promise<void> {
  const storeRoot = await mkdtemp(resolve(tmpdir(), "liushi-harness-e2e-"));
  try {
    await callback(storeRoot);
  } finally {
    const tempRoot = resolve(tmpdir());
    const relativePath = relative(tempRoot, resolve(storeRoot));
    if (isAbsolute(relativePath) || relativePath.startsWith("..") || relativePath === "") {
      throw new Error("Refusing to remove a Store outside os.tmpdir.");
    }
    await rm(storeRoot, { recursive: true, force: true });
  }
}
