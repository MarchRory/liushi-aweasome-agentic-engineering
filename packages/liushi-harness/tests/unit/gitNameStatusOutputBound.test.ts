import { describe, expect, it } from "vitest";

import { calculateGitNameStatusOutputBound } from "../../src/infrastructure/gitCommittedChangeSetInspector/output/index.js";

describe("Git Name Status Output Bound", () => {
  it("按完整 Write Set 的 UTF-8 路径长度线性计算 no-renames 输出上界", () => {
    const writeSet = ["src/a.ts", "目录/文件.ts"];
    const expected = writeSet.reduce((total, path) => total + Buffer.byteLength(path) + 3, 0);

    expect(calculateGitNameStatusOutputBound(writeSet)).toBe(expected);
    expect(calculateGitNameStatusOutputBound([])).toBeUndefined();
  });
});
