import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { WorktreeChangeKind } from "../../src/application/ports/worktree/index.js";
import { parseWorktreeStatus } from "../../src/infrastructure/worktree/index.js";

describe("Worktree status parser", () => {
  it("将 clean worktree 的空 stdout 解析为空变化集合", () => {
    const result = parseWorktreeStatus("");

    expect(result).toEqual({ status: ResultStatus.Success, value: [] });
  });

  it("解析普通变化、未跟踪文件和删除", () => {
    const result = parseWorktreeStatus(
      " M src/changed.ts\u0000?? src/new.ts\u0000 D src/deleted.ts\u0000",
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toEqual([
      { path: "src/changed.ts", kind: WorktreeChangeKind.Modified },
      { path: "src/new.ts", kind: WorktreeChangeKind.Untracked },
      { path: "src/deleted.ts", kind: WorktreeChangeKind.Deleted },
    ]);
  });

  it("解析无分数和带分数的 rename/copy，并保留两个受影响路径", () => {
    const result = parseWorktreeStatus(
      "R  src/new.ts\u0000src/old.ts\u0000C100 src/copy.ts\u0000src/source.ts\u0000",
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value).toEqual([
      {
        path: "src/new.ts",
        originalPath: "src/old.ts",
        kind: WorktreeChangeKind.Renamed,
      },
      {
        path: "src/copy.ts",
        originalPath: "src/source.ts",
        kind: WorktreeChangeKind.Copied,
      },
    ]);
  });

  it("拒绝没有 NUL 终止符或包含路径逃逸的状态记录", () => {
    const missingTerminator = parseWorktreeStatus(" M src/file.ts");
    const escapedPath = parseWorktreeStatus("?? ../outside.ts\u0000");

    expect(missingTerminator.status).toBe(ResultStatus.Failure);
    expect(escapedPath.status).toBe(ResultStatus.Failure);
  });
});
