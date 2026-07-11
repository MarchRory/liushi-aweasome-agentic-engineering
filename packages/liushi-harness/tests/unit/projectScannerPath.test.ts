import { describe, expect, it } from "vitest";

import { normalizeRequestedRelativePath } from "../../src/infrastructure/projectScanner/index.js";

describe("Project Scanner 相对路径标准化", () => {
  it.each(["a/..", "a/b/..", "safe/../file", "a/./file"])(
    "拒绝包含当前或父级目录 segment 的路径 %s",
    (relativePath) => {
      expect(normalizeRequestedRelativePath(relativePath)).toBeUndefined();
    },
  );

  it("保留不含危险 segment 的相对路径", () => {
    expect(normalizeRequestedRelativePath("safe/path/file.json")).toBe("safe/path/file.json");
  });
});
