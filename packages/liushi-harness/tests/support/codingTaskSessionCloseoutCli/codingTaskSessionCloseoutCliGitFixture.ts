import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ResultStatus } from "../../../src/index.js";
import { NodeCommandRunnerAdapter } from "../../../src/infrastructure/index.js";

const commandRunner = new NodeCommandRunnerAdapter();

/** 创建由 E2E 测试统一清理的临时绝对路径。 */
export async function createCloseoutCliTemporaryRoot(
  roots: string[],
  prefix: string,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** 通过真实 git 可执行文件执行一条无交互命令。 */
export async function runCloseoutCliGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await commandRunner.run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure) throw result.error;
  if (result.value.exitCode !== 0) {
    throw new Error(`Git 命令失败：${args.join(" ")}。${result.value.stderr}`);
  }
  return result.value.stdout.trim();
}
