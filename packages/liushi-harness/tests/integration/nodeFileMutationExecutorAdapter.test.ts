import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActionOutcome,
  FileMutationKind,
  ResultStatus,
  WorktreeInspectionStatus,
  parseRepositoryId,
  success,
  type ApplyFileMutationsInput,
  type InspectWorktreeInput,
  type WorktreeInspectionReport,
  type WorktreeInspectorPort,
} from "../../src/index.js";
import {
  NodeFileMutationExecutorAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";

const roots: string[] = [];
const digest = new Rfc8785Sha256DigestAdapter();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("NodeFileMutationExecutorAdapter 受控写入", () => {
  it("只从 repositoryRoot 推导受管工作树，并忽略伪造的外部 worktreeRoot", async () => {
    /** 调用契约不得暴露可重定向写入根的 worktreeRoot。 */
    type hasWorktreeRoot = "worktreeRoot" extends keyof ApplyFileMutationsInput ? true : false;
    const hasCallerWorktreeRoot: hasWorktreeRoot = false;
    const fixture = await createFixture();
    const externalRoot = await createRoot("liushi-file-mutation-external-");
    const externalTarget = join(externalRoot, "src", "index.ts");
    await mkdir(join(externalRoot, "src"));
    await writeFile(externalTarget, "external unchanged\n");
    const input = mutationInput(fixture, "managed updated\n") as ApplyFileMutationsInput & {
      readonly worktreeRoot: string;
    };
    Object.assign(input, { worktreeRoot: externalRoot });

    const result = await executor(["src/index.ts"]).execute(input);

    expect(hasCallerWorktreeRoot).toBe(false);
    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { outcome: ActionOutcome.Succeeded },
    });
    expect(await readFile(fixture.target, "utf8")).toBe("managed updated\n");
    expect(await readFile(externalTarget, "utf8")).toBe("external unchanged\n");
  });

  it("写后回读实际内容，并以实际内容摘要验收输出", async () => {
    const fixture = await createFixture();
    const targetContent = "export const value = 2;\n";
    const targetDigest = unwrap(digest.calculate(targetContent));

    const result = await executor(["src/index.ts"]).execute(mutationInput(fixture, targetContent));

    expect(await readFile(fixture.target, "utf8")).toBe(targetContent);
    expect(result).toEqual(
      success({
        outcome: ActionOutcome.Succeeded,
        evidenceIds: ["file:src/index.ts"],
        outputDigest: unwrap(
          digest.calculate([{ path: "src/index.ts", contentDigest: targetDigest }]),
        ),
      }),
    );
  });

  it.skipIf(process.platform === "win32")("Replace 保持原文件 mode", async () => {
    const fixture = await createFixture();
    await chmod(fixture.target, 0o751);
    const originalMode = (await stat(fixture.target)).mode & 0o777;

    const result = await executor(["src/index.ts"]).execute(
      mutationInput(fixture, "mode preserved\n"),
    );

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { outcome: ActionOutcome.Succeeded },
    });
    expect((await stat(fixture.target)).mode & 0o777).toBe(originalMode);
  });

  it.skipIf(process.platform === "win32")("拒绝经符号链接父目录写到受管树外", async () => {
    const fixture = await createFixture(false);
    const externalRoot = await createRoot("liushi-file-mutation-symlink-");
    await symlink(externalRoot, join(fixture.worktreeRoot, "linked"), "dir");
    const content = "must not escape\n";
    const input = createInput(fixture, {
      path: "linked/escaped.ts",
      kind: FileMutationKind.Create,
      content,
      contentDigest: unwrap(digest.calculate(content)),
    });

    const result = await executor(["linked/escaped.ts"]).execute(input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        outcome: ActionOutcome.NotApplied,
        errorCode: "file_mutation_parent_unsafe",
      },
    });
    await expect(access(join(externalRoot, "escaped.ts"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("临时文件碰撞时不删除非本次创建的文件且不替换目标", async () => {
    const fixture = await createFixture();
    const targetContent = "write must fail\n";
    const targetDigest = unwrap(digest.calculate(targetContent));
    const temporaryPath = `${fixture.target}.liushi-${targetDigest.slice(-16)}.tmp`;
    await writeFile(temporaryPath, "collision\n");

    const result = await executor(["src/index.ts"]).execute(mutationInput(fixture, targetContent));

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        outcome: ActionOutcome.OutcomeUnknown,
        errorCode: "file_mutation_write_or_durability_unknown",
      },
    });
    expect(await readFile(fixture.target, "utf8")).toBe(fixture.initialContent);
    expect(await readFile(temporaryPath, "utf8")).toBe("collision\n");
  });
});

/** 文件变更适配器测试使用的受管目录夹具。 */
interface Fixture {
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly target: string;
  readonly initialContent: string;
}

async function createFixture(withTarget = true): Promise<Fixture> {
  const repositoryRoot = await createRoot("liushi-file-mutation-repository-");
  const worktreeRoot = join(repositoryRoot, "worktrees", "task");
  const target = join(worktreeRoot, "src", "index.ts");
  const initialContent = "export const value = 1;\n";
  await mkdir(join(worktreeRoot, "src"), { recursive: true });
  if (withTarget) await writeFile(target, initialContent);
  return { repositoryRoot, worktreeRoot, target, initialContent };
}

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function mutationInput(fixture: Fixture, content: string): ApplyFileMutationsInput {
  return createInput(fixture, {
    path: "src/index.ts",
    kind: FileMutationKind.Replace,
    expectedContentDigest: unwrap(digest.calculate(fixture.initialContent)),
    content,
    contentDigest: unwrap(digest.calculate(content)),
  });
}

function createInput(
  fixture: Fixture,
  mutation: ApplyFileMutationsInput["mutations"][number],
): ApplyFileMutationsInput {
  const repositoryId = unwrap(parseRepositoryId("file-mutation-repository"));
  return {
    repositoryId,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: {
      worktreeId: "file-mutation-worktree",
      relativePath: "worktrees/task",
      branchName: "feature/file-mutation",
      managed: true,
    },
    baseRevision: "0123456789abcdef0123456789abcdef01234567",
    writeSet: [mutation.path],
    mutations: [mutation],
  };
}

function executor(changedPaths: readonly string[]): NodeFileMutationExecutorAdapter {
  return new NodeFileMutationExecutorAdapter(sequenceInspector(changedPaths), digest);
}

function sequenceInspector(changedPaths: readonly string[]): WorktreeInspectorPort {
  let calls = 0;
  return {
    inspect(input) {
      const status = calls === 0 ? WorktreeInspectionStatus.Ready : WorktreeInspectionStatus.Dirty;
      calls += 1;
      return Promise.resolve(
        success(
          inspectionReport(
            input,
            status,
            status === WorktreeInspectionStatus.Dirty ? changedPaths : [],
          ),
        ),
      );
    },
  };
}

function inspectionReport(
  input: InspectWorktreeInput,
  status: WorktreeInspectionStatus,
  changedPaths: readonly string[],
): WorktreeInspectionReport {
  return {
    repositoryId: input.repositoryId,
    worktreeId: input.worktreeBinding.worktreeId,
    worktreeRelativePath: input.worktreeBinding.relativePath,
    expectedBranchName: input.worktreeBinding.branchName,
    actualBranchName: input.worktreeBinding.branchName,
    declaredBaseRevision: input.baseRevision,
    resolvedBaseRevision: input.baseRevision,
    actualHeadRevision: input.baseRevision,
    status,
    writeSet: input.writeSet,
    changedPaths,
    writeSetViolations: [],
    changes: [],
    diagnostics: [],
  };
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
