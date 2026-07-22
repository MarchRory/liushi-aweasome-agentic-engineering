import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecutorCompatibilitySignedReleaseManifestArtifact } from "../../src/application/executorCompatibilityReleaseManifestAttestation/index.js";
import {
  ExecutorCompatibilityReleaseArtifactWriteDisposition,
  ExecutorCompatibilityStoredReleaseArtifactKind,
} from "../../src/application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import { ParentDirectorySyncStatus } from "../../src/application/ports/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter,
  NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter,
  NodeExecutorCompatibilitySignedManifestArtifactReaderAdapter,
  NodeExecutorCompatibilitySignedManifestArtifactWriterAdapter,
} from "../../src/infrastructure/executorCompatibilityReleaseArtifact/index.js";
import { FileParentDirectoryDurability } from "../../src/infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createExecutorCompatibilityReleaseManifestAttestationFixture,
  createExecutorCompatibilitySigstoreBundleStub,
  createSignedAttestationArtifactForFixture,
} from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("Executor Compatibility Signed Attestation Artifact 文件适配器", () => {
  it("created、幂等复用并严格 roundtrip", async () => {
    const outputRoot = await runtimeStores.create("liushi-attestation-artifact-");
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const outputFilePath = join(outputRoot, "attestation.json");
    const writer = new NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter(
      outputRoot,
      fixture.digest,
      new FileParentDirectoryDurability(),
    );

    const created = await writer.write({ artifact, outputFilePath });
    const reused = await writer.write({ artifact, outputFilePath });

    expect(created).toMatchObject({
      status: ResultStatus.Success,
      value: {
        kind: ExecutorCompatibilityStoredReleaseArtifactKind.SignedAttestation,
        disposition: ExecutorCompatibilityReleaseArtifactWriteDisposition.Created,
        artifactDigest: artifact.artifactDigest,
        outputFilePath,
      },
    });
    expect(reused).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityReleaseArtifactWriteDisposition.IdempotentReuse,
      },
    });
    if (created.status === ResultStatus.Failure) throw created.error;
    const reader = new NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter(
      fixture.digest,
    );
    expect(
      await reader.read({
        filePath: outputFilePath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: created.value.byteLength,
      }),
    ).toEqual({ status: ResultStatus.Success, value: artifact });
  });

  it("Reader 拒绝错误 digest、byteLength、非 canonical、重复 key 与目录", async () => {
    const outputRoot = await runtimeStores.create("liushi-attestation-reader-errors-");
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const reader = new NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter(
      fixture.digest,
    );
    const canonicalPath = join(outputRoot, "canonical.json");
    const canonicalBytes = Buffer.from(`${canonicalizeJson(artifact)}\n`, "utf8");
    await writeFile(canonicalPath, canonicalBytes);

    expect(
      await reader.read({
        filePath: canonicalPath,
        expectedArtifactDigest: artifact.statementDigest,
        expectedByteLength: canonicalBytes.byteLength,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(
      await reader.read({
        filePath: canonicalPath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: canonicalBytes.byteLength + 1,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });

    const noncanonicalPath = join(outputRoot, "noncanonical.json");
    const noncanonicalBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(noncanonicalPath, noncanonicalBytes);
    expect(
      await reader.read({
        filePath: noncanonicalPath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: noncanonicalBytes.byteLength,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });

    const bomPath = join(outputRoot, "bom.json");
    const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonicalBytes]);
    await writeFile(bomPath, bomBytes);
    expect(
      await reader.read({
        filePath: bomPath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: bomBytes.byteLength,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });

    const duplicatePath = join(outputRoot, "duplicate.json");
    const duplicateBytes = Buffer.from(
      `{"schemaVersion":"duplicate",${canonicalizeJson(artifact).slice(1)}\n`,
      "utf8",
    );
    await writeFile(duplicatePath, duplicateBytes);
    expect(
      await reader.read({
        filePath: duplicatePath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: duplicateBytes.byteLength,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });

    const directoryPath = join(outputRoot, "directory.json");
    await mkdir(directoryPath);
    expect(
      await reader.read({
        filePath: directoryPath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: 1,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("Reader 拒绝 symlink 文件路径；平台无能力时显式跳过", async (context) => {
    const outputRoot = await runtimeStores.create("liushi-attestation-reader-link-");
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const targetPath = join(outputRoot, "target.json");
    const linkedPath = join(outputRoot, "linked.json");
    const bytes = Buffer.from(`${canonicalizeJson(artifact)}\n`, "utf8");
    await writeFile(targetPath, bytes);
    try {
      await symlink(targetPath, linkedPath, "file");
    } catch (error) {
      if (isSymlinkCapabilityError(error)) {
        context.skip();
        return;
      }
      throw error;
    }

    const reader = new NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter(
      fixture.digest,
    );
    expect(
      await reader.read({
        filePath: linkedPath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: bytes.byteLength,
      }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it("Writer 拒绝逃逸、嵌套、目录和不同有效内容冲突", async () => {
    const outputRoot = await runtimeStores.create("liushi-attestation-writer-errors-");
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const differentArtifact = createSignedAttestationArtifactForFixture(
      fixture,
      createExecutorCompatibilitySigstoreBundleStub("different"),
    );
    const writer = new NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter(
      outputRoot,
      fixture.digest,
      new FileParentDirectoryDurability(),
    );

    for (const outputFilePath of [
      resolve(outputRoot, "..", "escaped.json"),
      join(outputRoot, "nested", "artifact.json"),
    ]) {
      expect(await writer.write({ artifact, outputFilePath })).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.PreconditionNotMet },
      });
    }

    const directoryPath = join(outputRoot, "directory.json");
    await mkdir(directoryPath);
    expect(await writer.write({ artifact, outputFilePath: directoryPath })).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });

    const conflictPath = join(outputRoot, "conflict.json");
    expect(await writer.write({ artifact, outputFilePath: conflictPath })).toMatchObject({
      status: ResultStatus.Success,
    });
    expect(
      await writer.write({ artifact: differentArtifact, outputFilePath: conflictPath }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(await readFile(conflictPath)).toEqual(
      Buffer.from(`${canonicalizeJson(artifact)}\n`, "utf8"),
    );
  });

  it("相同内容并发发布只有一个 Created", async () => {
    const outputRoot = await runtimeStores.create("liushi-attestation-concurrent-");
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const outputFilePath = join(outputRoot, "attestation.json");
    const writer = new NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter(
      outputRoot,
      fixture.digest,
      new FileParentDirectoryDurability(),
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, () => writer.write({ artifact, outputFilePath })),
    );
    expect(results.every((result) => result.status === ResultStatus.Success)).toBe(true);
    expect(
      results.filter(
        (result) =>
          result.status === ResultStatus.Success &&
          result.value.disposition === ExecutorCompatibilityReleaseArtifactWriteDisposition.Created,
      ),
    ).toHaveLength(1);
  });

  it("拒绝 symlink 或 junction outputRoot；平台无能力时显式跳过", async (context) => {
    const storeRoot = await runtimeStores.create("liushi-artifact-root-link-");
    const realRoot = join(storeRoot, "real-root");
    const linkedRoot = join(storeRoot, "linked-root");
    await mkdir(realRoot);
    try {
      await symlink(realRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (isSymlinkCapabilityError(error)) {
        context.skip();
        return;
      }
      throw error;
    }
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const writer = new NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter(
      linkedRoot,
      fixture.digest,
      new FileParentDirectoryDurability(),
    );

    expect(
      await writer.write({ artifact, outputFilePath: join(linkedRoot, "artifact.json") }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("root 在发布期间被替换时 fail-closed 为 outcome unknown", async () => {
    const storeRoot = await runtimeStores.create("liushi-artifact-root-drift-");
    const outputRoot = join(storeRoot, "release-root");
    const movedRoot = join(storeRoot, "moved-root");
    await mkdir(outputRoot);
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createSignedAttestationArtifactForFixture(fixture);
    const writer = new NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter(
      outputRoot,
      fixture.digest,
      {
        syncParentDirectory: async () => {
          await rename(outputRoot, movedRoot);
          await mkdir(outputRoot);
          return { status: ParentDirectorySyncStatus.Synced };
        },
      },
    );

    expect(
      await writer.write({ artifact, outputFilePath: join(outputRoot, "artifact.json") }),
    ).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.ExecutorCompatibilityReleaseArtifactCommitOutcomeUnknown,
      },
    });
  });
});

describe("Executor Compatibility Signed Manifest Artifact 文件适配器", () => {
  it("created、幂等复用并严格 roundtrip", async () => {
    const outputRoot = await runtimeStores.create("liushi-manifest-artifact-");
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const createdArtifact = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: fixture.manifestAttestationDraft,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("manifest"),
      },
      fixture.digest,
    );
    if (createdArtifact.status === ResultStatus.Failure) throw createdArtifact.error;
    const artifact = createdArtifact.value;
    const outputFilePath = join(outputRoot, "manifest.json");
    const writer = new NodeExecutorCompatibilitySignedManifestArtifactWriterAdapter(
      outputRoot,
      fixture.digest,
      new FileParentDirectoryDurability(),
    );

    const created = await writer.write({ artifact, outputFilePath });
    const reused = await writer.write({ artifact, outputFilePath });

    expect(created).toMatchObject({
      status: ResultStatus.Success,
      value: {
        kind: ExecutorCompatibilityStoredReleaseArtifactKind.SignedManifest,
        disposition: ExecutorCompatibilityReleaseArtifactWriteDisposition.Created,
        artifactDigest: artifact.artifactDigest,
      },
    });
    expect(reused).toMatchObject({
      status: ResultStatus.Success,
      value: {
        disposition: ExecutorCompatibilityReleaseArtifactWriteDisposition.IdempotentReuse,
      },
    });
    if (created.status === ResultStatus.Failure) throw created.error;
    const reader = new NodeExecutorCompatibilitySignedManifestArtifactReaderAdapter(fixture.digest);
    expect(
      await reader.read({
        filePath: outputFilePath,
        expectedArtifactDigest: artifact.artifactDigest,
        expectedByteLength: created.value.byteLength,
      }),
    ).toEqual({ status: ResultStatus.Success, value: artifact });
  });
});

function isSymlinkCapabilityError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOSYS")
  );
}
