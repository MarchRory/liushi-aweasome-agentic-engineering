import { describe, expect, it } from "vitest";

import {
  isBestEffortDirectorySyncError,
  isPlatformEquivalentDirectorySyncError,
  normalizePathIdentity,
  pathsOverlap,
  samePathIdentity,
} from "../../src/infrastructure/system/index.js";
import {
  isDurableParentDirectorySyncStatus,
  ParentDirectorySyncStatus,
} from "../../src/application/ports/index.js";

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

  it("按 Windows 路径身份识别大小写别名和祖先关系", () => {
    expect(pathsOverlap("C:/Repository", "c:/repository/.runtime", "win32")).toBe(true);
    expect(pathsOverlap("C:/Repository", "C:/Runtime", "win32")).toBe(false);
  });

  it("保留 POSIX 根路径并识别其祖先关系", () => {
    expect(normalizePathIdentity("/", "linux")).toBe("/");
    expect(pathsOverlap("/", "/repository", "linux")).toBe(true);
  });

  it("保留 Windows 盘符根与 UNC 根并识别其祖先关系", () => {
    expect(normalizePathIdentity("C:\\", "win32")).toBe("c:\\");
    expect(pathsOverlap("C:\\", "C:\\repository", "win32")).toBe(true);
    expect(normalizePathIdentity("\\\\Server\\Share\\", "win32")).toBe("\\\\server\\share\\");
    expect(pathsOverlap("\\\\Server\\Share\\", "\\\\server\\share\\repository", "win32")).toBe(
      true,
    );
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

  it("仅将 Windows EPERM fsync 识别为平台等价耐久", () => {
    const error = Object.assign(new Error("directory sync failed"), {
      code: "EPERM",
      syscall: "fsync",
    });
    expect(isPlatformEquivalentDirectorySyncError(error, "win32")).toBe(true);
  });

  it.each([
    ["linux", "EPERM", "fsync"],
    ["win32", "EACCES", "fsync"],
    ["win32", "EPERM", "open"],
  ] as const)("拒绝平台 %s、错误码 %s、syscall %s 的非等价组合", (platform, code, syscall) => {
    expect(
      isPlatformEquivalentDirectorySyncError(
        Object.assign(new Error("directory sync failed"), { code, syscall }),
        platform,
      ),
    ).toBe(false);
  });

  it.each([
    [ParentDirectorySyncStatus.Synced, true],
    [ParentDirectorySyncStatus.PlatformEquivalent, true],
    [ParentDirectorySyncStatus.BestEffort, false],
  ] as const)("目录刷新状态 %s 的耐久判定为 %s", (status, expected) => {
    expect(isDurableParentDirectorySyncStatus(status)).toBe(expected);
  });
});
