import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ManagedFileActualKind } from "../../src/domain/installation/index.js";
import {
  NodeManagedFileStateReaderAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const stores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

describe("Node Managed File State Reader", () => {
  afterEach(async () => stores.cleanup());

  it("读取 missing、普通文件和损坏 manifest", async () => {
    const root = await stores.create("liushi-managed-reader-");
    const reader = new NodeManagedFileStateReaderAdapter(digest);
    expect(await reader.readActual(root, ".codex/hooks.json")).toMatchObject({
      status: ResultStatus.Success,
      value: { kind: ManagedFileActualKind.Missing },
    });
    await mkdir(join(root, ".codex"));
    await writeFile(join(root, ".codex", "hooks.json"), "{}\n", "utf8");
    const regular = await reader.readActual(root, ".codex/hooks.json");
    expect(regular.status).toBe(ResultStatus.Success);
    if (regular.status === ResultStatus.Success) {
      expect(regular.value.kind).toBe(ManagedFileActualKind.RegularFile);
      expect(regular.value.digest).toMatch(/^sha256:/u);
    }
    await mkdir(join(root, ".liushi-harness"));
    await writeFile(join(root, ".liushi-harness", "managed-files.json"), "{invalid", "utf8");
    expect(await reader.readManifest(root)).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("readContentSnapshot 精确返回 missing 与普通文件内容和摘要", async () => {
    const root = await stores.create("liushi-managed-snapshot-");
    const reader = new NodeManagedFileStateReaderAdapter(digest);
    const path = ".codex/hooks.json";

    expect(await reader.readContentSnapshot(root, path)).toEqual({
      status: ResultStatus.Success,
      value: { path, kind: ManagedFileActualKind.Missing },
    });

    const content = '{"hooks":[]}\n';
    await mkdir(join(root, ".codex"));
    await writeFile(join(root, ".codex", "hooks.json"), content, "utf8");

    expect(await reader.readContentSnapshot(root, path)).toEqual({
      status: ResultStatus.Success,
      value: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        content,
        digest: unwrap(digest.calculate(content)),
      },
    });
  });

  it("readContentSnapshot 拒绝目录", async () => {
    const root = await stores.create("liushi-managed-snapshot-directory-");
    await mkdir(join(root, ".codex"));

    expect(
      await new NodeManagedFileStateReaderAdapter(digest).readContentSnapshot(root, ".codex"),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("readContentSnapshot 拒绝符号链接", async ({ skip }) => {
    const root = await stores.create("liushi-managed-snapshot-link-");
    const outside = await stores.create("liushi-managed-snapshot-link-target-");
    if (!(await tryCreateDirectoryLink(outside, join(root, "linked")))) {
      skip();
      return;
    }

    expect(
      await new NodeManagedFileStateReaderAdapter(digest).readContentSnapshot(root, "linked"),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("findMissingParentDirectories 对多路径去重并稳定排序嵌套缺失目录", async () => {
    const root = await stores.create("liushi-managed-missing-parents-");
    await mkdir(join(root, ".codex"));
    const reader = new NodeManagedFileStateReaderAdapter(digest);

    expect(
      await reader.findMissingParentDirectories(root, [
        "tools/deep/install.json",
        ".codex/rules/project.json",
        ".codex/hooks/nested/pre-commit.json",
        "tools/deep/verify.json",
        ".codex/hooks/nested/pre-commit.json",
      ]),
    ).toEqual({
      status: ResultStatus.Success,
      value: [".codex/hooks", ".codex/hooks/nested", ".codex/rules", "tools", "tools/deep"],
    });
  });

  it("findMissingParentDirectories 拒绝现有非目录父路径", async () => {
    const root = await stores.create("liushi-managed-parent-file-");
    await writeFile(join(root, ".codex"), "not a directory\n", "utf8");

    expect(
      await new NodeManagedFileStateReaderAdapter(digest).findMissingParentDirectories(root, [
        ".codex/hooks.json",
      ]),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.OperationForbidden,
        details: { path: ".codex/hooks.json" },
      },
    });
  });

  it("findMissingParentDirectories 拒绝符号链接父路径", async ({ skip }) => {
    const root = await stores.create("liushi-managed-parent-link-");
    const outside = await stores.create("liushi-managed-parent-link-target-");
    if (!(await tryCreateDirectoryLink(outside, join(root, "linked")))) {
      skip();
      return;
    }

    expect(
      await new NodeManagedFileStateReaderAdapter(digest).findMissingParentDirectories(root, [
        "linked/hooks.json",
      ]),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.OperationForbidden,
        details: { path: "linked/hooks.json" },
      },
    });
  });

  it("返回真实绝对根路径并拒绝相对路径", async () => {
    const root = await stores.create("liushi-managed-reader-root-");
    const reader = new NodeManagedFileStateReaderAdapter(digest);
    expect(await reader.resolveRoot(root)).toMatchObject({
      status: ResultStatus.Success,
      value: root,
    });
    expect(await reader.resolveRoot("relative/repository")).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("拒绝符号链接父目录", async ({ skip }) => {
    const root = await stores.create("liushi-managed-reader-link-");
    const outside = await stores.create("liushi-managed-reader-outside-");
    if (!(await tryCreateDirectoryLink(outside, join(root, ".codex")))) {
      skip();
      return;
    }

    const result = await new NodeManagedFileStateReaderAdapter(digest).readActual(
      root,
      ".codex/hooks.json",
    );
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });
});

async function tryCreateDirectoryLink(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") return false;
    throw error;
  }
}

function unwrap<T>(result: { status: ResultStatus; value?: T; error?: Error }): T {
  if (result.status !== ResultStatus.Success || result.value === undefined) {
    throw new Error(result.error?.message ?? "测试值解析失败。");
  }
  return result.value;
}
