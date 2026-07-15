import { access, chmod, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ManagedFileActualKind } from "../../src/domain/installation/index.js";
import {
  NodeManagedFileStateReaderAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { NodeManagedFileMutationAdapter } from "../../src/infrastructure/managedFileMutation/index.js";
import { FileParentDirectoryDurability } from "../../src/infrastructure/persistence/fileEventStore/parentDirectoryDurability/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const stores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

describe("Node Managed File Mutation", () => {
  afterEach(async () => stores.cleanup());

  it("replace create 创建父目录并返回写后读回摘要", async () => {
    const root = await stores.create("liushi-managed-mutation-create-");
    const path = ".codex/nested/hooks.json";
    const content = '{"hooks":["create"]}\n';
    const contentDigest = unwrap(digest.calculate(content));
    const adapter = createAdapter();

    const result = await adapter.replace({
      root,
      path,
      expected: { path, kind: ManagedFileActualKind.Missing },
      content,
      digest: contentDigest,
    });

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: { path, kind: ManagedFileActualKind.RegularFile, digest: contentDigest },
    });
    expect(await readFile(join(root, ".codex", "nested", "hooks.json"), "utf8")).toBe(content);
    expect(
      await new NodeManagedFileStateReaderAdapter(digest).readContentSnapshot(root, path),
    ).toEqual({
      status: ResultStatus.Success,
      value: { path, kind: ManagedFileActualKind.RegularFile, content, digest: contentDigest },
    });
  });

  it("replace update 成功替换现有文件", async () => {
    const root = await stores.create("liushi-managed-mutation-update-");
    const path = ".codex/hooks.json";
    const target = join(root, ".codex", "hooks.json");
    const original = '{"hooks":["old"]}\n';
    const content = '{"hooks":["new"]}\n';
    await mkdir(join(root, ".codex"));
    await writeFile(target, original, "utf8");

    const result = await createAdapter().replace({
      root,
      path,
      expected: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        digest: unwrap(digest.calculate(original)),
      },
      content,
      digest: unwrap(digest.calculate(content)),
    });

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        digest: unwrap(digest.calculate(content)),
      },
    });
    expect(await readFile(target, "utf8")).toBe(content);
  });

  it("摘要错误在写前失败且不修改文件", async () => {
    const root = await stores.create("liushi-managed-mutation-invalid-digest-");
    const path = "managed.txt";
    const target = join(root, path);
    const original = "original\n";
    const content = "replacement\n";
    let durabilityCalls = 0;
    await writeFile(target, original, "utf8");
    const adapter = new NodeManagedFileMutationAdapter(digest, {
      syncParentDirectory: () => {
        durabilityCalls += 1;
        return Promise.reject(new Error("摘要错误时不应进入耐久性阶段。"));
      },
    });

    const result = await adapter.replace({
      root,
      path,
      expected: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        digest: unwrap(digest.calculate(original)),
      },
      content,
      digest: unwrap(digest.calculate("different content\n")),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(durabilityCalls).toBe(0);
    expect(await readFile(target, "utf8")).toBe(original);
  });

  it("前置状态漂移在写前失败且保留漂移后的文件", async () => {
    const root = await stores.create("liushi-managed-mutation-drift-");
    const path = "managed.txt";
    const target = join(root, path);
    const plannedContent = "planned preimage\n";
    const driftedContent = "drifted before replace\n";
    const replacement = "replacement\n";
    let durabilityCalls = 0;
    await writeFile(target, driftedContent, "utf8");
    const adapter = new NodeManagedFileMutationAdapter(digest, {
      syncParentDirectory: () => {
        durabilityCalls += 1;
        return Promise.reject(new Error("前置状态漂移时不应进入耐久性阶段。"));
      },
    });

    const result = await adapter.replace({
      root,
      path,
      expected: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        digest: unwrap(digest.calculate(plannedContent)),
      },
      content: replacement,
      digest: unwrap(digest.calculate(replacement)),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(durabilityCalls).toBe(0);
    expect(await readFile(target, "utf8")).toBe(driftedContent);
  });

  it.skipIf(process.platform === "win32")("replace update 保留已有文件 mode", async () => {
    const root = await stores.create("liushi-managed-mutation-mode-");
    const path = "managed.sh";
    const target = join(root, path);
    const original = "#!/bin/sh\nexit 0\n";
    const content = "#!/bin/sh\nexit 1\n";
    await writeFile(target, original, "utf8");
    await chmod(target, 0o751);
    const originalMode = (await stat(target)).mode & 0o777;

    const result = await createAdapter().replace({
      root,
      path,
      expected: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        digest: unwrap(digest.calculate(original)),
      },
      content,
      digest: unwrap(digest.calculate(content)),
    });

    expect(result.status).toBe(ResultStatus.Success);
    expect((await stat(target)).mode & 0o777).toBe(originalMode);
  });

  it("目录耐久性失败返回未知结果且不重试或二次写入", async () => {
    const root = await stores.create("liushi-managed-mutation-durability-");
    const path = "managed.txt";
    const target = join(root, path);
    const original = "original\n";
    const content = "first adapter write\n";
    const sentinel = "durability failure sentinel\n";
    let durabilityCalls = 0;
    let contentObservedAtSync: string | undefined;
    await writeFile(target, original, "utf8");
    const adapter = new NodeManagedFileMutationAdapter(digest, {
      syncParentDirectory: async (filePath) => {
        durabilityCalls += 1;
        contentObservedAtSync = await readFile(filePath, "utf8");
        await writeFile(filePath, sentinel, "utf8");
        throw new Error("injected directory fsync failure");
      },
    });

    const result = await adapter.replace({
      root,
      path,
      expected: {
        path,
        kind: ManagedFileActualKind.RegularFile,
        digest: unwrap(digest.calculate(original)),
      },
      content,
      digest: unwrap(digest.calculate(content)),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InstallationCommitOutcomeUnknown },
    });
    expect(durabilityCalls).toBe(1);
    expect(contentObservedAtSync).toBe(content);
    expect(await readFile(target, "utf8")).toBe(sentinel);
  });

  it("拒绝经符号链接父路径写到仓库外", async ({ skip }) => {
    const root = await stores.create("liushi-managed-mutation-link-");
    const outside = await stores.create("liushi-managed-mutation-link-target-");
    const linked = join(root, "linked");
    if (!(await tryCreateDirectoryLink(outside, linked))) {
      skip();
      return;
    }
    const path = "linked/escaped.txt";
    const content = "must not escape\n";
    let durabilityCalls = 0;
    const adapter = new NodeManagedFileMutationAdapter(digest, {
      syncParentDirectory: () => {
        durabilityCalls += 1;
        return Promise.reject(new Error("符号链接父路径不应进入耐久性阶段。"));
      },
    });

    const result = await adapter.replace({
      root,
      path,
      expected: { path, kind: ManagedFileActualKind.Missing },
      content,
      digest: unwrap(digest.calculate(content)),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
    expect(durabilityCalls).toBe(0);
    await expect(access(join(outside, "escaped.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function createAdapter(): NodeManagedFileMutationAdapter {
  return new NodeManagedFileMutationAdapter(digest, new FileParentDirectoryDurability());
}

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
