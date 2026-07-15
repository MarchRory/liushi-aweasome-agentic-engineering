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

describe("Node Managed File State Reader", () => {
  afterEach(async () => stores.cleanup());

  it("读取 missing、普通文件和损坏 manifest", async () => {
    const root = await stores.create("liushi-managed-reader-");
    const reader = new NodeManagedFileStateReaderAdapter(new Rfc8785Sha256DigestAdapter());
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

  it("返回真实绝对根路径并拒绝相对路径", async () => {
    const root = await stores.create("liushi-managed-reader-root-");
    const reader = new NodeManagedFileStateReaderAdapter(new Rfc8785Sha256DigestAdapter());
    expect(await reader.resolveRoot(root)).toMatchObject({
      status: ResultStatus.Success,
      value: root,
    });
    expect(await reader.resolveRoot("relative/repository")).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("拒绝符号链接父目录", async () => {
    const root = await stores.create("liushi-managed-reader-link-");
    const outside = await stores.create("liushi-managed-reader-outside-");
    try {
      await symlink(outside, join(root, ".codex"), "junction");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EPERM"
      )
        return;
      throw error;
    }
    const result = await new NodeManagedFileStateReaderAdapter(
      new Rfc8785Sha256DigestAdapter(),
    ).readActual(root, ".codex/hooks.json");
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });
});
