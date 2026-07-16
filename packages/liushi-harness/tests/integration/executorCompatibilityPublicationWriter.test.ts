import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION,
  ExecutorCompatibilityPublicationWriteDisposition,
} from "../../src/application/ports/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { createExecutorCompatibilityPublicationBundle } from "../../src/domain/executorCompatibilityPublication/index.js";
import {
  FileParentDirectoryDurability,
  NodeExecutorCompatibilityPublicationWriterAdapter,
  Rfc8785Sha256DigestAdapter,
  canonicalizeJson,
} from "../../src/infrastructure/index.js";
import { createExecutorCompatibilityPublicationFixture } from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

afterEach(async () => {
  await runtimeStores.cleanup();
});

describe("NodeExecutorCompatibilityPublicationWriterAdapter", () => {
  it("首次写入返回 Created 并发布严格规范化的文件字节和回执", async () => {
    const storeRoot = await runtimeStores.create("liushi-publication-writer-created-");
    const outputFilePath = join(storeRoot, "publication", "bundle.json");
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const expectedContent = `${canonicalizeJson(fixture.bundle)}\n`;

    const result = await createWriter().write({ bundle: fixture.bundle, outputFilePath });

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        schemaVersion: EXECUTOR_COMPATIBILITY_PUBLICATION_WRITE_RESULT_SCHEMA_VERSION,
        disposition: ExecutorCompatibilityPublicationWriteDisposition.Created,
        outputFilePath,
        bundleDigest: fixture.bundle.bundleDigest,
        matrixDigest: fixture.bundle.matrix.matrixDigest,
        packageDigest: fixture.bundle.releaseSubject.packageDigest,
        packageName: fixture.bundle.releaseSubject.packageName,
        packageVersion: fixture.bundle.releaseSubject.packageVersion,
        byteLength: Buffer.byteLength(expectedContent, "utf8"),
      },
    });
    expect(await readFile(outputFilePath)).toEqual(Buffer.from(expectedContent, "utf8"));
  });

  it("同一 Bundle 再写返回 IdempotentReuse 且文件字节不变", async () => {
    const storeRoot = await runtimeStores.create("liushi-publication-writer-reuse-");
    const outputFilePath = join(storeRoot, "bundle.json");
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const writer = createWriter();

    const first = await writer.write({ bundle: fixture.bundle, outputFilePath });
    const beforeReuse = await readFile(outputFilePath);
    const second = await writer.write({ bundle: fixture.bundle, outputFilePath });
    const afterReuse = await readFile(outputFilePath);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: ExecutorCompatibilityPublicationWriteDisposition.Created },
    });
    expect(second).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: ExecutorCompatibilityPublicationWriteDisposition.IdempotentReuse },
    });
    expect(afterReuse).toEqual(beforeReuse);
    expect(afterReuse).toEqual(canonicalPublicationBytes(fixture.bundle));
  });

  it("并发八次写同一目标时恰好一次 Created 且七次 IdempotentReuse", async () => {
    const storeRoot = await runtimeStores.create("liushi-publication-writer-concurrent-");
    const outputFilePath = join(storeRoot, "bundle.json");
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const writer = createWriter();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => writer.write({ bundle: fixture.bundle, outputFilePath })),
    );
    const successfulResults = results.filter((result) => result.status === ResultStatus.Success);

    expect(successfulResults).toHaveLength(8);
    expect(
      successfulResults.filter(
        (result) =>
          result.value.disposition === ExecutorCompatibilityPublicationWriteDisposition.Created,
      ),
    ).toHaveLength(1);
    expect(
      successfulResults.filter(
        (result) =>
          result.value.disposition ===
          ExecutorCompatibilityPublicationWriteDisposition.IdempotentReuse,
      ),
    ).toHaveLength(7);
    expect(await readFile(outputFilePath)).toEqual(canonicalPublicationBytes(fixture.bundle));
  });

  it("目标已有不同内容时返回 PreconditionNotMet 且保留既有字节", async () => {
    const storeRoot = await runtimeStores.create("liushi-publication-writer-conflict-");
    const outputFilePath = join(storeRoot, "bundle.json");
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const existingBytes = Buffer.from("既有发布内容不得覆盖\n", "utf8");
    await writeFile(outputFilePath, existingBytes);

    const result = await createWriter().write({ bundle: fixture.bundle, outputFilePath });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(await readFile(outputFilePath)).toEqual(existingBytes);
  });

  it("相对输出路径返回 InvalidInput", async () => {
    const fixture = await createExecutorCompatibilityPublicationFixture();

    const result = await createWriter().write({
      bundle: fixture.bundle,
      outputFilePath: ".",
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("父目录耐久化失败时返回提交结果未知且完整目标已出现", async () => {
    const storeRoot = await runtimeStores.create("liushi-publication-writer-unknown-");
    const outputFilePath = join(storeRoot, "bundle.json");
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const parentDirectoryDurability = new FileParentDirectoryDurability();
    const syncParentDirectory = vi
      .spyOn(parentDirectoryDurability, "syncParentDirectory")
      .mockRejectedValueOnce(new Error("注入父目录耐久化失败"));

    const result = await createWriter(parentDirectoryDurability).write({
      bundle: fixture.bundle,
      outputFilePath,
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.ExecutorCompatibilityPublicationCommitOutcomeUnknown,
      },
    });
    expect(syncParentDirectory).toHaveBeenCalledOnce();
    expect(syncParentDirectory).toHaveBeenCalledWith(outputFilePath);
    expect(await readFile(outputFilePath)).toEqual(canonicalPublicationBytes(fixture.bundle));
  });

  it("两个不同合法 Bundle 并发写同一目标时一个创建且另一个明确冲突", async () => {
    const storeRoot = await runtimeStores.create("liushi-publication-writer-race-");
    const outputFilePath = join(storeRoot, "bundle.json");
    const fixture = await createExecutorCompatibilityPublicationFixture();
    const differentBundleResult = createExecutorCompatibilityPublicationBundle(
      {
        releaseSubject: {
          ...fixture.releaseSubject,
          packageVersion: "0.0.1",
          sourceRevision: "b".repeat(40),
        },
        matrix: fixture.matrix,
        policy: fixture.policy,
        projections: fixture.projections,
      },
      fixture.digest,
    );
    if (differentBundleResult.status === ResultStatus.Failure) {
      throw differentBundleResult.error;
    }
    expect(differentBundleResult.value.bundleDigest).not.toBe(fixture.bundle.bundleDigest);
    const bundles = [fixture.bundle, differentBundleResult.value] as const;

    const results = await Promise.all(
      bundles.map((bundle) => createWriter().write({ bundle, outputFilePath })),
    );
    const successfulIndexes = results.flatMap((result, index) =>
      result.status === ResultStatus.Success ? [index] : [],
    );
    const failedResults = results.filter((result) => result.status === ResultStatus.Failure);

    expect(successfulIndexes).toHaveLength(1);
    expect(failedResults).toHaveLength(1);
    expect(failedResults[0]).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    const successfulIndex = successfulIndexes[0];
    if (successfulIndex === undefined) throw new Error("缺少成功发布结果");
    expect(results[successfulIndex]).toMatchObject({
      status: ResultStatus.Success,
      value: { disposition: ExecutorCompatibilityPublicationWriteDisposition.Created },
    });
    expect(await readFile(outputFilePath)).toEqual(
      canonicalPublicationBytes(bundles[successfulIndex]),
    );
  });
});

function createWriter(
  parentDirectoryDurability = new FileParentDirectoryDurability(),
): NodeExecutorCompatibilityPublicationWriterAdapter {
  return new NodeExecutorCompatibilityPublicationWriterAdapter(digest, parentDirectoryDurability);
}

function canonicalPublicationBytes(bundle: unknown): Buffer {
  return Buffer.from(`${canonicalizeJson(bundle)}\n`, "utf8");
}
