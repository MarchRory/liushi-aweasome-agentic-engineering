import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { createCodexHostPathSemantics } from "../../src/infrastructure/index.js";

describe("Codex Host 来源路径语义", () => {
  it("在非 Windows 进程中也按 Windows 规则比较来源路径", () => {
    const result = createCodexHostPathSemantics("win32");
    if (result.status === ResultStatus.Failure) throw result.error;

    expect(result.value.isAbsolute("C:\\host\\worktree")).toBe(true);
    expect(result.value.equals("C:\\host\\temp\\..\\worktree", "C:/host/worktree")).toBe(true);
    expect(result.value.join("C:\\host", "control", "prepareManifest.json")).toBe(
      "C:\\host\\control\\prepareManifest.json",
    );
  });

  it.each(["C:\\host\\worktree", "C:/host/worktree", "D:\\"])(
    "接受完整 Windows 驱动器绝对路径：%s",
    (path) => {
      const result = createCodexHostPathSemantics("win32");
      if (result.status === ResultStatus.Failure) throw result.error;

      expect(result.value.isAbsolute(path)).toBe(true);
    },
  );

  it.each(["\\\\server\\share", "\\\\server\\share\\worktree", "//server/share/worktree"])(
    "接受完整 Windows UNC 路径：%s",
    (path) => {
      const result = createCodexHostPathSemantics("win32");
      if (result.status === ResultStatus.Failure) throw result.error;

      expect(result.value.isAbsolute(path)).toBe(true);
    },
  );

  it.each([
    "\\root",
    "/root",
    "C:relative",
    "\\\\server",
    "\\\\server\\",
    "\\\\server\\\\worktree",
    "\\\\.\\pipe\\liushi-harness",
    "\\\\?\\C:\\host\\worktree",
    "\\\\?\\UNC\\server\\share",
    "C:\\host\0worktree",
  ])("拒绝不完整的 Windows 绝对路径：%s", (path) => {
    const result = createCodexHostPathSemantics("win32");
    if (result.status === ResultStatus.Failure) throw result.error;

    expect(result.value.isAbsolute(path)).toBe(false);
    expect(result.value.equals(path, path)).toBe(false);
  });

  it.each(["linux", "darwin"])("按 %s 的 Posix 规则比较来源路径", (platform) => {
    const result = createCodexHostPathSemantics(platform);
    if (result.status === ResultStatus.Failure) throw result.error;

    expect(result.value.isAbsolute("/host/worktree")).toBe(true);
    expect(result.value.equals("/host/temp/../worktree", "/host/worktree")).toBe(true);
    expect(result.value.isAbsolute("C:\\host\\worktree")).toBe(false);
  });

  it("拒绝没有显式语义的来源平台", () => {
    const result = createCodexHostPathSemantics("freebsd");

    expect(result.status).toBe(ResultStatus.Failure);
  });
});
