import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import { validateWorktreeInspectionInput } from "../../src/infrastructure/worktree/index.js";

const repositoryId = parseRepositoryId("repository");

describe("Worktree inspection validation", () => {
  it("接受规范的运行时 Root、Worktree Binding、Base Revision 和 Write Set", () => {
    if (repositoryId.status === ResultStatus.Failure) throw repositoryId.error;

    const result = validateWorktreeInspectionInput({
      repositoryId: repositoryId.value,
      repositoryRoot: "C:\\repositories\\demo",
      worktreeBinding: {
        worktreeId: "task-worktree",
        relativePath: "worktrees/task-worktree",
        branchName: "task/worktree",
        managed: true,
      },
      baseRevision: "HEAD",
      writeSet: ["src/a.ts", "src/b.ts"],
    });

    expect(result.status).toBe(ResultStatus.Success);
  });

  it("拒绝非规范 Write Set、路径逃逸和 Base Revision option injection", () => {
    if (repositoryId.status === ResultStatus.Failure) throw repositoryId.error;

    const base = {
      repositoryId: repositoryId.value,
      repositoryRoot: "C:\\repositories\\demo",
      worktreeBinding: {
        worktreeId: "task-worktree",
        relativePath: "worktrees/task-worktree",
        branchName: "task/worktree",
        managed: true,
      },
      baseRevision: "HEAD",
      writeSet: ["src/a.ts", "src/b.ts"],
    };

    const unsorted = validateWorktreeInspectionInput({
      ...base,
      writeSet: ["src/b.ts", "src/a.ts"],
    });
    const escaped = validateWorktreeInspectionInput({ ...base, writeSet: ["../outside.ts"] });
    const injected = validateWorktreeInspectionInput({
      ...base,
      baseRevision: "--upload-pack=evil",
    });

    expect(unsorted.status).toBe(ResultStatus.Failure);
    expect(escaped.status).toBe(ResultStatus.Failure);
    expect(injected.status).toBe(ResultStatus.Failure);
  });
});
