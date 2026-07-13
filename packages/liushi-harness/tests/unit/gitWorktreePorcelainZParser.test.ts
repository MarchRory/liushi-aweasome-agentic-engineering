import { describe, expect, it } from "vitest";

import { WorktreeProvisionRecoveryDiagnosticCode } from "../../src/application/ports/index.js";
import { ResultStatus } from "../../src/common/index.js";
import { parseGitWorktreePorcelainZ } from "../../src/infrastructure/index.js";

describe("git worktree porcelain -z parser", () => {
  it("解析分支与 detached 条目且不保留原始输出", () => {
    const output = [
      "worktree /repo",
      `HEAD ${"a".repeat(40)}`,
      "branch refs/heads/main",
      "",
      "worktree /repo/worktrees/task",
      `HEAD ${"b".repeat(40)}`,
      "detached",
      "",
      "",
    ].join("\0");

    const result = parseGitWorktreePorcelainZ(output);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: [
        { worktreePath: "/repo", headRevision: "a".repeat(40), branchName: "main" },
        { worktreePath: "/repo/worktrees/task", headRevision: "b".repeat(40) },
      ],
    });
  });

  it("对缺少 NUL 终止或必需字段的输出 fail closed", () => {
    expect(parseGitWorktreePorcelainZ("worktree /repo\0")).toEqual({
      status: ResultStatus.Failure,
      error: WorktreeProvisionRecoveryDiagnosticCode.RegistryOutputInvalid,
    });
    expect(parseGitWorktreePorcelainZ("worktree /repo")).toEqual({
      status: ResultStatus.Failure,
      error: WorktreeProvisionRecoveryDiagnosticCode.RegistryOutputInvalid,
    });
  });

  it("对重复身份字段、非法 Revision 和 detached 分支冲突 fail closed", () => {
    const invalidEntries = [
      [
        "worktree /repo",
        "worktree /other",
        `HEAD ${"a".repeat(40)}`,
        "branch refs/heads/main",
        "",
        "",
      ],
      ["worktree /repo", "HEAD not-a-revision", "branch refs/heads/main", "", ""],
      ["worktree /repo", `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "detached", "", ""],
    ];

    for (const fields of invalidEntries) {
      expect(parseGitWorktreePorcelainZ(fields.join("\0"))).toEqual({
        status: ResultStatus.Failure,
        error: WorktreeProvisionRecoveryDiagnosticCode.RegistryOutputInvalid,
      });
    }
  });
});
