import { describe, expect, it } from "vitest";

import { ResultStatus, type ContentDigest } from "../../src/common/index.js";
import {
  CodingTaskSessionChangeKind,
  createCodingTaskSessionChangeSet,
  createCodingTaskSessionChangeSetSnapshot,
  verifyCodingTaskSessionChangeSetSnapshot,
  type CodingTaskSessionChange,
} from "../../src/domain/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const repositoryId = requireSuccess(parseRepositoryId("coding-task-session"));
const baseRevision = "a".repeat(40);

describe("CodingTask Session ChangeSet 领域契约", () => {
  it("只改变现场字段时保持 ChangeSet Digest 不变并改变 Snapshot Digest", () => {
    const changes: readonly CodingTaskSessionChange[] = [
      {
        path: "src/changed.ts",
        kind: CodingTaskSessionChangeKind.Modified,
        targetContentDigest: digestOf({ bytes: "changed" }),
      },
    ];
    const changeSet = requireSuccess(
      createCodingTaskSessionChangeSet({ repositoryId, baseRevision, changes }, digest),
    );

    const first = requireSuccess(
      createCodingTaskSessionChangeSetSnapshot(
        {
          changeSet,
          worktreeId: "task-worktree",
          worktreeRelativePath: "worktrees/task",
          branchName: "task/worktree",
          observedHeadRevision: baseRevision,
          writeSet: ["src/changed.ts"],
        },
        digest,
      ),
    );
    const second = requireSuccess(
      createCodingTaskSessionChangeSetSnapshot(
        {
          changeSet,
          worktreeId: "task-worktree-2",
          worktreeRelativePath: "worktrees/task-2",
          branchName: "task/worktree-2",
          observedHeadRevision: "b".repeat(40),
          writeSet: ["src/changed.ts"],
        },
        digest,
      ),
    );

    expect(first.changeSetDigest).toBe(second.changeSetDigest);
    expect(first.snapshotDigest).not.toBe(second.snapshotDigest);
    expect(first.changedPaths).toEqual(["src/changed.ts"]);
  });

  it("拒绝非法 originalPath、删除非空摘要和重复目标路径", () => {
    const invalidOriginalPath = createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision,
        changes: [
          {
            path: "src/changed.ts",
            originalPath: "../outside.ts",
            kind: CodingTaskSessionChangeKind.Modified,
            targetContentDigest: digestOf({ bytes: "changed" }),
          },
        ],
      },
      digest,
    );
    const invalidDeletedDigest = createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision,
        changes: [
          {
            path: "src/deleted.ts",
            kind: CodingTaskSessionChangeKind.Deleted,
            targetContentDigest: digestOf({ bytes: "deleted" }),
          },
        ],
      },
      digest,
    );
    const duplicateTargetPath = createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision,
        changes: [
          {
            path: "src/same.ts",
            kind: CodingTaskSessionChangeKind.Modified,
            targetContentDigest: digestOf({ bytes: "one" }),
          },
          {
            path: "src/same.ts",
            kind: CodingTaskSessionChangeKind.Added,
            targetContentDigest: digestOf({ bytes: "two" }),
          },
        ],
      },
      digest,
    );
    const canonicalizationConflict = createCodingTaskSessionChangeSet(
      {
        repositoryId,
        baseRevision,
        changes: [
          {
            path: "src/new.ts",
            originalPath: "src/same.ts",
            kind: CodingTaskSessionChangeKind.Renamed,
            targetContentDigest: digestOf({ bytes: "new" }),
          },
          {
            path: "src/same.ts",
            kind: CodingTaskSessionChangeKind.Modified,
            targetContentDigest: digestOf({ bytes: "same" }),
          },
        ],
      },
      digest,
    );

    expect(invalidOriginalPath.status).toBe(ResultStatus.Failure);
    expect(invalidDeletedDigest.status).toBe(ResultStatus.Failure);
    expect(duplicateTargetPath.status).toBe(ResultStatus.Failure);
    expect(canonicalizationConflict.status).toBe(ResultStatus.Failure);
  });

  it("将 rename 和 copy canonicalize 为稳定排序的 Deleted 与 Added", () => {
    const result = requireSuccess(
      createCodingTaskSessionChangeSet(
        {
          repositoryId,
          baseRevision,
          changes: [
            {
              path: "z.ts",
              kind: CodingTaskSessionChangeKind.Added,
              targetContentDigest: digestOf({ bytes: "z" }),
            },
            {
              path: "a.ts",
              originalPath: "old.ts",
              kind: CodingTaskSessionChangeKind.Renamed,
              targetContentDigest: digestOf({ bytes: "a" }),
            },
            {
              path: "copy.ts",
              originalPath: "source.ts",
              kind: CodingTaskSessionChangeKind.Copied,
              targetContentDigest: digestOf({ bytes: "copy" }),
            },
          ],
        },
        digest,
      ),
    );

    expect(result.changes).toEqual([
      {
        path: "a.ts",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: digestOf({ bytes: "a" }),
      },
      {
        path: "copy.ts",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: digestOf({ bytes: "copy" }),
      },
      {
        path: "old.ts",
        kind: CodingTaskSessionChangeKind.Deleted,
        targetContentDigest: null,
      },
      {
        path: "z.ts",
        kind: CodingTaskSessionChangeKind.Added,
        targetContentDigest: digestOf({ bytes: "z" }),
      },
    ]);
  });

  it("重算完整 Snapshot，并拒绝字段或摘要篡改", () => {
    const changeSet = requireSuccess(
      createCodingTaskSessionChangeSet(
        {
          repositoryId,
          baseRevision,
          changes: [
            {
              path: "src/changed.ts",
              kind: CodingTaskSessionChangeKind.Modified,
              targetContentDigest: digestOf({ bytes: "changed" }),
            },
          ],
        },
        digest,
      ),
    );
    const snapshot = requireSuccess(
      createCodingTaskSessionChangeSetSnapshot(
        {
          changeSet,
          worktreeId: "task-worktree",
          worktreeRelativePath: "worktrees/task",
          branchName: "task/worktree",
          observedHeadRevision: baseRevision,
          writeSet: ["src/changed.ts"],
        },
        digest,
      ),
    );
    const firstChange = snapshot.changes[0];
    if (firstChange === undefined) throw new Error("测试 Snapshot 缺少变化项。");

    expect(verifyCodingTaskSessionChangeSetSnapshot(snapshot, digest).status).toBe(
      ResultStatus.Success,
    );
    expect(
      verifyCodingTaskSessionChangeSetSnapshot({ ...snapshot, branchName: "task/tampered" }, digest)
        .status,
    ).toBe(ResultStatus.Failure);
    expect(
      verifyCodingTaskSessionChangeSetSnapshot(
        {
          ...snapshot,
          changes: [
            {
              ...firstChange,
              targetContentDigest: digestOf({ bytes: "tampered" }),
            },
          ],
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      verifyCodingTaskSessionChangeSetSnapshot(
        { ...snapshot, snapshotDigest: digestOf({ snapshot: "tampered" }) },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);

    const renameChangeSet = requireSuccess(
      createCodingTaskSessionChangeSet(
        {
          repositoryId,
          baseRevision,
          changes: [
            {
              path: "src/new.ts",
              originalPath: "src/old.ts",
              kind: CodingTaskSessionChangeKind.Renamed,
              targetContentDigest: digestOf({ bytes: "renamed" }),
            },
          ],
        },
        digest,
      ),
    );
    const renameSnapshot = requireSuccess(
      createCodingTaskSessionChangeSetSnapshot(
        {
          changeSet: renameChangeSet,
          worktreeId: "task-worktree",
          worktreeRelativePath: "worktrees/task",
          branchName: "task/worktree",
          observedHeadRevision: baseRevision,
          writeSet: ["src/new.ts", "src/old.ts"],
        },
        digest,
      ),
    );
    expect(
      verifyCodingTaskSessionChangeSetSnapshot(
        {
          ...renameSnapshot,
          changes: [
            {
              path: "src/new.ts",
              originalPath: "src/old.ts",
              kind: CodingTaskSessionChangeKind.Renamed,
              targetContentDigest: digestOf({ bytes: "renamed" }),
            },
          ],
        },
        digest,
      ).status,
    ).toBe(ResultStatus.Failure);
  });
});

function digestOf(input: unknown): ContentDigest {
  return requireSuccess(digest.calculate(input));
}

function requireSuccess<T>(result: { status: ResultStatus; value?: T; error?: unknown }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(`测试 fixture 构造失败：${String(result.error)}`);
  }
  return result.value;
}
