import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  ChangeSetCheckpointService,
  type ChangeSetCheckpointInput,
} from "../../src/application/changeSetCheckpoint/index.js";
import type { GitCheckpointInput } from "../../src/application/ports/index.js";
import { ResultStatus, type Result } from "../../src/common/index.js";
import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import {
  NodeCommandRunnerAdapter,
  NodeGitChangeSetInspectorAdapter,
  NodeGitCheckpointAdapter,
  NodeGitCommittedChangeSetInspectorAdapter,
  NodeWorktreeInspectorAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";

const fixtureRoots: string[] = [];
const repositoryId = requireSuccess(parseRepositoryId("change-set-checkpoint-application"));

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((fixtureRoot) => rm(fixtureRoot, { recursive: true, force: true })),
  );
});

describe("ChangeSetCheckpointService 真实 Git 主链", () => {
  it("使用真实提交链执行、重放并精确重建绑定摘要", async () => {
    const fixture = await createFixture();
    const writeSet = ["src/index.ts"];
    const input = createInput(fixture, writeSet);
    await writeFile(join(fixture.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const application = createApplication();
    const preSubmitSnapshot = requireSuccess(
      await application.changeSetInspector.inspectPreSubmit(input),
    );
    const checkpointInput: ChangeSetCheckpointInput = {
      checkpointInput: input,
      preSubmitSnapshot,
    };

    const first = requireSuccess(await application.service.execute(checkpointInput));
    expect(first.outcome).toBe(ActionOutcome.Succeeded);
    expect(first.outputDigest).toBeDefined();
    expect(
      await runGit(fixture.worktreeRoot, ["rev-list", "--count", `${fixture.baseRevision}..HEAD`]),
    ).toBe("1");
    expect(await runGit(fixture.worktreeRoot, ["status", "--porcelain"])).toBe("");

    const replay = requireSuccess(await application.service.execute(checkpointInput));
    expect(replay).toMatchObject({ outcome: ActionOutcome.Succeeded });
    expect(replay.outputDigest).toBe(first.outputDigest);
    expect(
      await runGit(fixture.worktreeRoot, ["rev-list", "--count", `${fixture.baseRevision}..HEAD`]),
    ).toBe("1");

    const inspected = requireSuccess(await application.service.inspect(checkpointInput));
    expect(inspected.changeSetDigest).toBe(preSubmitSnapshot.changeSetDigest);
    expect(inspected.preSubmitSnapshotDigest).toBe(preSubmitSnapshot.snapshotDigest);
    expect(inspected.bindingDigest).toBe(first.outputDigest);
  }, 30_000);

  it("持久化 Snapshot 后发生现场漂移时不产生 Git 副作用", async () => {
    const fixture = await createFixture();
    const writeSet = ["src/index.ts"];
    const input = createInput(fixture, writeSet);
    await writeFile(join(fixture.worktreeRoot, "src", "index.ts"), "export const value = 2;\n");

    const application = createApplication();
    const persistedSnapshot = requireSuccess(
      await application.changeSetInspector.inspectPreSubmit(input),
    );
    await writeFile(join(fixture.worktreeRoot, "src", "index.ts"), "export const value = 3;\n");

    const result = requireSuccess(
      await application.service.execute({
        checkpointInput: input,
        preSubmitSnapshot: persistedSnapshot,
      }),
    );

    expect(result).toEqual({
      outcome: ActionOutcome.NotApplied,
      evidenceIds: [],
      errorCode: "change_set_checkpoint_pre_submit_drift",
    });
    expect(
      await runGit(fixture.worktreeRoot, ["rev-list", "--count", `${fixture.baseRevision}..HEAD`]),
    ).toBe("0");
  }, 30_000);
});

/** 临时 Git 仓库与受管 Worktree 的测试 fixture。 */
interface Fixture {
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly relativePath: string;
  readonly branchName: string;
  readonly baseRevision: string;
}

/** 真实 adapter 组合出的 ChangeSet Checkpoint 应用。 */
interface Application {
  readonly service: ChangeSetCheckpointService;
  readonly changeSetInspector: NodeGitChangeSetInspectorAdapter;
}

async function createFixture(): Promise<Fixture> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-change-set-checkpoint-"));
  fixtureRoots.push(repositoryRoot);
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await runGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, ["commit", "-m", "base"]);
  const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const relativePath = "managed-worktree";
  const branchName = "feature/checkpoint";
  await runGit(repositoryRoot, ["worktree", "add", "-b", branchName, relativePath, baseRevision]);
  return {
    repositoryRoot,
    worktreeRoot: join(repositoryRoot, relativePath),
    relativePath,
    branchName,
    baseRevision,
  };
}

function createApplication(): Application {
  const runner = new NodeCommandRunnerAdapter();
  const worktreeInspector = new NodeWorktreeInspectorAdapter(runner);
  const digest = new Rfc8785Sha256DigestAdapter();
  const changeSetInspector = new NodeGitChangeSetInspectorAdapter(worktreeInspector, digest);
  const committedChangeSetInspector = new NodeGitCommittedChangeSetInspectorAdapter(
    runner,
    worktreeInspector,
    digest,
  );
  const checkpoint = new NodeGitCheckpointAdapter(runner, worktreeInspector, digest);
  return {
    changeSetInspector,
    service: new ChangeSetCheckpointService(
      changeSetInspector,
      committedChangeSetInspector,
      checkpoint,
      digest,
    ),
  };
}

function createInput(fixture: Fixture, writeSet: readonly string[]): GitCheckpointInput {
  return {
    repositoryId,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: {
      worktreeId: "managed-task",
      relativePath: fixture.relativePath,
      branchName: fixture.branchName,
      managed: true,
    },
    baseRevision: fixture.baseRevision,
    writeSet,
    commitMessage: "chore(liushi): checkpoint change set",
  };
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const result = await new NodeCommandRunnerAdapter().run({
    executable: "git",
    args,
    cwd,
    timeoutMs: 10_000,
  });
  return requireSuccess(result).stdout.trim();
}

function requireSuccess<T>(result: Result<T, unknown>): T {
  if (result.status !== ResultStatus.Success) throw new Error(String(result.error));
  return result.value;
}
