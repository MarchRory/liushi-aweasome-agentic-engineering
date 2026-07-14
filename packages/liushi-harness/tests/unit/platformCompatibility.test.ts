import { describe, expect, it } from "vitest";

import {
  isBestEffortDirectorySyncError,
  normalizePathIdentity,
  samePathIdentity,
} from "../../src/infrastructure/system/index.js";

describe("平台兼容层", () => {
  it("按注入的 Windows 平台规则比较路径大小写", () => {
    expect(samePathIdentity("C:/Workspace/Project", "c:/workspace/project", "win32")).toBe(true);
    expect(normalizePathIdentity("C:/Workspace/Project", "win32")).toBe(
      normalizePathIdentity("c:/workspace/project", "win32"),
    );
  });

  it("按注入的 POSIX 平台规则保留路径大小写", () => {
    expect(samePathIdentity("/workspace/Project", "/workspace/project", "linux")).toBe(false);
  });

  it.each(["EISDIR", "EPERM", "EINVAL", "ENOTSUP", "EACCES"])(
    "将既有目录 fsync 错误码 %s 归类为 best-effort",
    (code) => {
      const error = Object.assign(new Error("directory sync failed"), { code });
      expect(isBestEffortDirectorySyncError(error)).toBe(true);
    },
  );

  it("未知目录 fsync 错误不允许降级", () => {
    const error = Object.assign(new Error("directory sync failed"), { code: "EIO" });
    expect(isBestEffortDirectorySyncError(error)).toBe(false);
  });
});
