import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { ActionOutcome, ResultStatus, parseRepositoryId } from "../../src/index.js";
import {
  NodeCommandRunnerAdapter,
  NodeGitCheckpointAdapter,
  NodeWorktreeInspectorAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";

const repositories: string[] = [];

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Node Git Checkpoint Adapter", () => {
  it("把 Write Set 内 Diff 提交为单一 Checkpoint，并支持无副作用恢复检查", async () => {
    const setup = await createSetup();
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const first = await setup.adapter.execute(setup.input);
    const inspected = await setup.adapter.inspect(setup.input);
    const recovered = await setup.adapter.execute(setup.input);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { outcome: ActionOutcome.Succeeded },
    });
    expect(inspected).toMatchObject({
      status: ResultStatus.Success,
      value: { changedPaths: ["src/index.ts"] },
    });
    expect(recovered).toEqual(first);
    expect(
      await runGit(setup.worktreeRoot, ["rev-list", "--count", `${setup.baseRevision}..HEAD`]),
    ).toBe("1");
    expect(await runGit(setup.worktreeRoot, ["status", "--porcelain"])).toBe("");
  });

  it("发现 Write Set 外 Diff 时不执行 Git Add，并返回未知结果等待恢复", async () => {
    const setup = await createSetup();
    await writeFile(join(setup.worktreeRoot, "outside.ts"), "outside\n");

    const result = await setup.adapter.execute(setup.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        outcome: ActionOutcome.OutcomeUnknown,
        errorCode: "git_checkpoint_preflight_unknown",
      },
    });
    expect(await runGit(setup.worktreeRoot, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("拒绝未受 Harness 管理的 Worktree 绑定", async () => {
    const setup = await createSetup();
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const result = await setup.adapter.execute({
      ...setup.input,
      worktreeBinding: { ...setup.input.worktreeBinding, managed: false },
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        outcome: ActionOutcome.NotApplied,
        errorCode: "git_checkpoint_input_invalid",
      },
    });
    expect(await runGit(setup.worktreeRoot, ["rev-list", "--count", "HEAD"])).toBe("1");
  });

  it("关闭 rename detection 后同时核验旧路径与新路径", async () => {
    const setup = await createSetup();
    await rename(
      join(setup.worktreeRoot, "src", "index.ts"),
      join(setup.worktreeRoot, "src", "renamed.ts"),
    );
    const input = { ...setup.input, writeSet: ["src/index.ts", "src/renamed.ts"] };

    const result = await setup.adapter.execute(input);
    const inspected = await setup.adapter.inspect(input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { outcome: ActionOutcome.Succeeded },
    });
    expect(inspected).toMatchObject({
      status: ResultStatus.Success,
      value: { changedPaths: ["src/index.ts", "src/renamed.ts"] },
    });
  });

  it("尊重项目 pre-commit Hook，拒绝时不绕过仓库策略", async () => {
    const setup = await createSetup();
    const hooksRoot = join(setup.repositoryRoot, ".githooks");
    const hook = join(hooksRoot, "pre-commit");
    await mkdir(hooksRoot);
    await writeFile(hook, "#!/bin/sh\nexit 1\n");
    await chmod(hook, 0o755);
    await runGit(setup.repositoryRoot, ["config", "core.hooksPath", hooksRoot]);
    await writeFile(join(setup.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const result = await setup.adapter.execute(setup.input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { outcome: ActionOutcome.OutcomeUnknown },
    });
    expect(
      await runGit(setup.worktreeRoot, ["rev-list", "--count", `${setup.baseRevision}..HEAD`]),
    ).toBe("0");
  });
});

/** Git Checkpoint Adapter 的真实仓库测试环境。 */
interface Setup {
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly baseRevision: string;
  readonly adapter: NodeGitCheckpointAdapter;
  readonly input: Parameters<NodeGitCheckpointAdapter["execute"]>[0];
}

/** 创建配置了本地提交身份的 Main 仓库和 Managed Worktree。 */
async function createSetup(): Promise<Setup> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-git-checkpoint-"));
  repositories.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await runGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, ["commit", "-m", "base"]);
  const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const worktreeRoot = join(repositoryRoot, "worktrees", "task");
  await runGit(repositoryRoot, [
    "worktree",
    "add",
    "-b",
    "feature/checkpoint",
    worktreeRoot,
    baseRevision,
  ]);
  const runner = new NodeCommandRunnerAdapter();
  const digest = new Rfc8785Sha256DigestAdapter();
  const adapter = new NodeGitCheckpointAdapter(
    runner,
    new NodeWorktreeInspectorAdapter(runner),
    digest,
  );
  return {
    repositoryRoot,
    worktreeRoot,
    baseRevision,
    adapter,
    input: {
      repositoryId: unwrap(parseRepositoryId("repo-1")),
      repositoryRoot,
      worktreeBinding: {
        worktreeId: "worktree-1",
        relativePath: "worktrees/task",
        branchName: "feature/checkpoint",
        managed: true,
      },
      baseRevision,
      writeSet: ["src/index.ts"],
      commitMessage: "chore(liushi): checkpoint implementation",
    },
  };
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  if (result.status === ResultStatus.Failure || result.value.exitCode !== 0)
    throw new Error("Git 测试命令失败。");
  return result.value.stdout.trim();
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined)
    throw new Error(result.error?.message ?? "测试值解析失败。");
  return result.value;
}
