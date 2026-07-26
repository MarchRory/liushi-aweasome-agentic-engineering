import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  WorktreeChangeKind,
  WorktreeInspectionStatus,
  type InspectWorktreeInput,
  type WorktreeInspectionReport,
  type WorktreeInspectorPort,
} from "../../src/application/ports/worktree/index.js";
import { ResultStatus, success } from "../../src/common/index.js";
import { parseRepositoryId, type RepositoryId } from "../../src/domain/workspace/index.js";
import {
  NodeGitChangeSetInspectorAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";

const fixtureRoots: string[] = [];
const repositoryId = requireSuccess(parseRepositoryId("change-set-safety"));
const baseRevision = "a".repeat(40);

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Node Git ChangeSet Inspector 安全边界", () => {
  it.each([WorktreeChangeKind.Unmerged, WorktreeChangeKind.Unknown])(
    "拒绝无法形成确定语义的变化类型 %s",
    async (kind) => {
      const fixture = await createFixture();
      await writeFile(join(fixture.worktreeRoot, "target.bin"), Buffer.from([1]));
      const result = await inspect(fixture, fixedInspector(createReport(fixture, kind)));

      expect(result.status).toBe(ResultStatus.Failure);
    },
  );

  it("拒绝符号链接和非普通文件目标，不读取链接指向的外部内容", async () => {
    const fixture = await createFixture();
    const outsideRoot = await mkdtemp(join(tmpdir(), "liushi-change-set-outside-"));
    fixtureRoots.push(outsideRoot);
    await writeFile(join(outsideRoot, "secret.txt"), "不能读取\n");
    await symlink(outsideRoot, join(fixture.worktreeRoot, "target.bin"), "junction");

    const linked = await inspect(
      fixture,
      fixedInspector(createReport(fixture, WorktreeChangeKind.Added)),
    );
    expect(linked.status).toBe(ResultStatus.Failure);

    await rm(join(fixture.worktreeRoot, "target.bin"), { recursive: true, force: true });
    await mkdir(join(fixture.worktreeRoot, "target.bin"));
    const directory = await inspect(
      fixture,
      fixedInspector(createReport(fixture, WorktreeChangeKind.Added)),
    );
    expect(directory.status).toBe(ResultStatus.Failure);
  });

  it("两次现场读取之间目标字节变化时关闭式拒绝", async () => {
    const fixture = await createFixture();
    const target = join(fixture.worktreeRoot, "target.bin");
    await writeFile(target, Buffer.from([1, 2, 3, 4]));
    const report = createReport(fixture, WorktreeChangeKind.Modified);
    let inspectionCount = 0;
    const inspector: WorktreeInspectorPort = {
      inspect: async () => {
        inspectionCount += 1;
        if (inspectionCount === 2) {
          await writeFile(target, Buffer.from([4, 3, 2, 1]));
        }
        return success(report);
      },
    };

    const result = await inspect(fixture, inspector);

    expect(result.status).toBe(ResultStatus.Failure);
    expect(inspectionCount).toBe(2);
  });

  it("拒绝未受 Harness 管理的 Worktree", async () => {
    const fixture = await createFixture();
    let inspectionCount = 0;
    const inspector: WorktreeInspectorPort = {
      inspect: () => {
        inspectionCount += 1;
        return Promise.resolve(success(createReport(fixture, WorktreeChangeKind.Modified)));
      },
    };
    const adapter = new NodeGitChangeSetInspectorAdapter(
      inspector,
      new Rfc8785Sha256DigestAdapter(),
    );

    const result = await adapter.inspectPreSubmit({
      ...createInput(fixture),
      worktreeBinding: { ...createInput(fixture).worktreeBinding, managed: false },
    });

    expect(result.status).toBe(ResultStatus.Failure);
    expect(inspectionCount).toBe(0);
  });
});

/** 安全测试使用的最小 Repository 与 Worktree 目录。 */
interface Fixture {
  /** 临时 Repository Root。 */
  readonly repositoryRoot: string;
  /** 临时 Worktree Root。 */
  readonly worktreeRoot: string;
  /** Worktree 相对路径。 */
  readonly relativePath: string;
  /** Repository 稳定标识。 */
  readonly repositoryId: RepositoryId;
}

async function createFixture(): Promise<Fixture> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "liushi-change-set-safety-"));
  fixtureRoots.push(repositoryRoot);
  const relativePath = "managed-worktree";
  const worktreeRoot = join(repositoryRoot, relativePath);
  await mkdir(worktreeRoot);
  return { repositoryRoot, worktreeRoot, relativePath, repositoryId };
}

function createInput(fixture: Fixture): InspectWorktreeInput {
  return {
    repositoryId: fixture.repositoryId,
    repositoryRoot: fixture.repositoryRoot,
    worktreeBinding: {
      worktreeId: "managed-task",
      relativePath: fixture.relativePath,
      branchName: "task/worktree",
      managed: true,
    },
    baseRevision,
    writeSet: ["target.bin"],
  };
}

function createReport(fixture: Fixture, kind: WorktreeChangeKind): WorktreeInspectionReport {
  return {
    repositoryId: fixture.repositoryId,
    worktreeId: "managed-task",
    worktreeRelativePath: fixture.relativePath,
    expectedBranchName: "task/worktree",
    actualBranchName: "task/worktree",
    declaredBaseRevision: baseRevision,
    resolvedBaseRevision: baseRevision,
    actualHeadRevision: baseRevision,
    status: WorktreeInspectionStatus.Dirty,
    writeSet: ["target.bin"],
    changedPaths: ["target.bin"],
    writeSetViolations: [],
    changes: [{ path: "target.bin", kind }],
    diagnostics: [],
  };
}

function fixedInspector(report: WorktreeInspectionReport): WorktreeInspectorPort {
  return { inspect: () => Promise.resolve(success(report)) };
}

function inspect(fixture: Fixture, inspector: WorktreeInspectorPort) {
  return new NodeGitChangeSetInspectorAdapter(
    inspector,
    new Rfc8785Sha256DigestAdapter(),
  ).inspectPreSubmit(createInput(fixture));
}

function requireSuccess<T>(result: { status: ResultStatus; value?: T; error?: unknown }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(`测试 fixture 构造失败：${String(result.error)}`);
  }
  return result.value;
}
