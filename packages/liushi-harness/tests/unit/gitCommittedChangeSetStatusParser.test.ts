import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { WorktreeChangeKind } from "../../src/application/ports/worktree/index.js";
import { parseGitCommittedChangeSetStatus } from "../../src/infrastructure/gitCommittedChangeSetInspector/status/index.js";

describe("已提交 Git ChangeSet 状态解析器", () => {
  it("解析 copy 并保留原始路径", () => {
    const output = ["C100", "src/original.txt", "src/copy.txt", ""].join("\u0000");

    expect(parseGitCommittedChangeSetStatus(output)).toEqual({
      status: ResultStatus.Success,
      value: [
        {
          path: "src/copy.txt",
          originalPath: "src/original.txt",
          kind: WorktreeChangeKind.Copied,
        },
      ],
    });
  });

  it.each([
    ["unknown", "X\u0000src/file.txt\u0000"],
    ["unmerged", "U\u0000src/file.txt\u0000"],
    ["illegal NUL", "M\u0000src/file.txt\u0000\u0000"],
  ])("拒绝 %s 状态输出", (_label, output) => {
    expect(parseGitCommittedChangeSetStatus(output).status).toBe(ResultStatus.Failure);
  });

  it("拒绝重复的目标路径", () => {
    const output = ["M", "src/file.txt", "A", "src/file.txt", ""].join("\u0000");

    expect(parseGitCommittedChangeSetStatus(output).status).toBe(ResultStatus.Failure);
  });
});
