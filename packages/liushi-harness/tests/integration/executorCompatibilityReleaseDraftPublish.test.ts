import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SignExecutorCompatibilityReleaseAttestationUseCase } from "../../src/application/useCases/signExecutorCompatibilityReleaseAttestation/index.js";
import { SignExecutorCompatibilityReleaseManifestUseCase } from "../../src/application/useCases/signExecutorCompatibilityReleaseManifest/index.js";
import { PublishExecutorCompatibilityReleaseAttestationUseCase } from "../../src/application/useCases/publishExecutorCompatibilityReleaseAttestation/index.js";
import { PublishExecutorCompatibilityReleaseManifestUseCase } from "../../src/application/useCases/publishExecutorCompatibilityReleaseManifest/index.js";
import type { ExecutorCompatibilityAttestationSignerPort } from "../../src/application/ports/executorCompatibilityAttestation/index.js";
import { HarnessErrorCode, ResultStatus, success } from "../../src/common/index.js";
import { ExecutorCompatibilityReleaseApprovalSubject } from "../../src/domain/executorCompatibilityAttestation/index.js";
import { NodeExecutorCompatibilityReleaseDraftReaderAdapter } from "../../src/infrastructure/executorCompatibilityReleaseDraftReader/index.js";
import {
  NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter,
  NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter,
  NodeExecutorCompatibilitySignedManifestArtifactReaderAdapter,
  NodeExecutorCompatibilitySignedManifestArtifactWriterAdapter,
} from "../../src/infrastructure/executorCompatibilityReleaseArtifact/index.js";
import { FileParentDirectoryDurability } from "../../src/infrastructure/persistence/fileEventStore/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/jsonDigest/adapter/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";
import { createExecutorCompatibilityTrustedApprovalAuthority } from "../support/executorCompatibility/executorCompatibilityReleaseApprovalAuthorityTestHelpers.js";
import { createExecutorCompatibilityAttestationFixture } from "../support/executorCompatibility/executorCompatibilityAttestationFixture.js";
import { createExecutorCompatibilityReleaseManifestAttestationFixture } from "../support/executorCompatibility/executorCompatibilityReleaseManifestAttestationFixture.js";
import {
  createStrictExecutorCompatibilityAttestationDraft,
  createExecutorCompatibilitySigstoreBundleStub,
} from "../support/executorCompatibility/executorCompatibilitySignedAttestationTestHelpers.js";

describe("strict release draft reader", () => {
  it("读取两类 canonical Draft", async () => {
    const attestationFixture = await createExecutorCompatibilityAttestationFixture();
    const manifestFixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const root = await mkdtemp(join(tmpdir(), "liushi-release-draft-"));
    const reader = new NodeExecutorCompatibilityReleaseDraftReaderAdapter(
      new Rfc8785Sha256DigestAdapter(),
    );
    try {
      const attestationPath = join(root, "attestation.json");
      const manifestPath = join(root, "manifest.json");
      await writeFile(
        attestationPath,
        `${canonicalizeJson(createStrictExecutorCompatibilityAttestationDraft(attestationFixture))}\n`,
      );
      await writeFile(
        manifestPath,
        `${canonicalizeJson(manifestFixture.manifestAttestationDraft)}\n`,
      );
      expect((await reader.readAttestationDraft({ draftFilePath: attestationPath })).status).toBe(
        ResultStatus.Success,
      );
      expect((await reader.readManifestDraft({ draftFilePath: manifestPath })).status).toBe(
        ResultStatus.Success,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["relative", "directory", "non-canonical", "BOM", "duplicate key"])(
    "拒绝 %s 并返回稳定 InvalidInput",
    async (kind) => {
      const fixture = await createExecutorCompatibilityAttestationFixture();
      const root = await mkdtemp(join(tmpdir(), "liushi-release-draft-invalid-"));
      const reader = new NodeExecutorCompatibilityReleaseDraftReaderAdapter(fixture.digest);
      const draft = createStrictExecutorCompatibilityAttestationDraft(fixture);
      const path = join(root, "draft.json");
      try {
        if (kind === "relative") {
          expect(await reader.readAttestationDraft({ draftFilePath: "draft.json" })).toMatchObject({
            status: ResultStatus.Failure,
            error: { code: HarnessErrorCode.InvalidInput },
          });
          return;
        }
        if (kind === "directory") {
          expect(await reader.readAttestationDraft({ draftFilePath: root })).toMatchObject({
            status: ResultStatus.Failure,
            error: { code: HarnessErrorCode.InvalidInput },
          });
          return;
        }
        const canonical = Buffer.from(`${canonicalizeJson(draft)}\n`, "utf8");
        const bytes =
          kind === "non-canonical"
            ? Buffer.from(JSON.stringify(draft), "utf8")
            : kind === "BOM"
              ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), canonical])
              : Buffer.from('{"a":1,"a":1}', "utf8");
        await writeFile(path, bytes);
        expect(await reader.readAttestationDraft({ draftFilePath: path })).toMatchObject({
          status: ResultStatus.Failure,
          error: { code: HarnessErrorCode.InvalidInput },
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("拒绝 symlink 文件；平台不支持时显式跳过", async (context) => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const root = await mkdtemp(join(tmpdir(), "liushi-release-draft-link-"));
    const target = join(root, "target.json");
    const link = join(root, "link.json");
    try {
      await writeFile(
        target,
        `${canonicalizeJson(createStrictExecutorCompatibilityAttestationDraft(fixture))}\n`,
      );
      try {
        await symlink(target, link, "file");
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error.code === "EPERM" || error.code === "EACCES" || error.code === "ENOSYS")
        ) {
          context.skip();
          return;
        }
        throw error;
      }
      const result = await new NodeExecutorCompatibilityReleaseDraftReaderAdapter(
        fixture.digest,
      ).readAttestationDraft({ draftFilePath: link });
      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

it("完成真实 Node Reader -> 真实 Sign UseCase -> P4c1 Writer -> Artifact Reader 闭环", async () => {
  const fixture = await createExecutorCompatibilityAttestationFixture();
  const root = await mkdtemp(join(tmpdir(), "liushi-release-publish-"));
  const draftPath = join(root, "draft.json");
  const outputPath = join(root, "artifact.json");
  const draft = createStrictExecutorCompatibilityAttestationDraft(fixture);
  const signer: ExecutorCompatibilityAttestationSignerPort = {
    sign: () =>
      Promise.resolve(
        success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("closed-loop") }),
      ),
  };
  const authority = createExecutorCompatibilityTrustedApprovalAuthority(
    [
      {
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
        artifactDigest: fixture.releaseCandidate.candidateDigest,
        decisionRequest: fixture.decisionRequest,
        approvalRecord: fixture.approvalRecord,
      },
    ],
    fixture.digest,
  );
  try {
    await writeFile(draftPath, `${canonicalizeJson(draft)}\n`);
    const signUseCase = new SignExecutorCompatibilityReleaseAttestationUseCase(
      signer,
      authority,
      fixture.digest,
    );
    const writer = new NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter(
      root,
      fixture.digest,
      new FileParentDirectoryDurability(),
    );
    const published = await new PublishExecutorCompatibilityReleaseAttestationUseCase(
      new NodeExecutorCompatibilityReleaseDraftReaderAdapter(fixture.digest),
      signUseCase,
      writer,
    ).execute({ draftFilePath: draftPath, outputFilePath: outputPath });
    expect(published.status).toBe(ResultStatus.Success);
    if (published.status === ResultStatus.Failure) throw published.error;
    const artifact = await new NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter(
      fixture.digest,
    ).read({
      filePath: outputPath,
      expectedArtifactDigest: published.value.artifactDigest,
      expectedByteLength: published.value.byteLength,
    });
    expect(artifact.status).toBe(ResultStatus.Success);
    expect(await readFile(outputPath)).toHaveLength(published.value.byteLength);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("完成 Manifest 的真实 Node Reader -> Sign -> Writer -> Reader 闭环", async () => {
  const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
  const root = await mkdtemp(join(tmpdir(), "liushi-release-manifest-publish-"));
  const draftPath = join(root, "draft.json");
  const outputPath = join(root, "artifact.json");
  const signer: ExecutorCompatibilityAttestationSignerPort = {
    sign: () =>
      Promise.resolve(
        success({ sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub("manifest-loop") }),
      ),
  };
  const authority = createExecutorCompatibilityTrustedApprovalAuthority(
    [
      {
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
        artifactDigest: fixture.manifest.manifestDigest,
        decisionRequest: fixture.manifestDecisionRequest,
        approvalRecord: fixture.manifestApprovalRecord,
      },
    ],
    fixture.digest,
  );
  try {
    await writeFile(draftPath, `${canonicalizeJson(fixture.manifestAttestationDraft)}\n`);
    const published = await new PublishExecutorCompatibilityReleaseManifestUseCase(
      new NodeExecutorCompatibilityReleaseDraftReaderAdapter(fixture.digest),
      new SignExecutorCompatibilityReleaseManifestUseCase(signer, authority, fixture.digest),
      new NodeExecutorCompatibilitySignedManifestArtifactWriterAdapter(
        root,
        fixture.digest,
        new FileParentDirectoryDurability(),
      ),
    ).execute({ draftFilePath: draftPath, outputFilePath: outputPath });
    expect(published.status).toBe(ResultStatus.Success);
    if (published.status === ResultStatus.Failure) throw published.error;

    const artifact = await new NodeExecutorCompatibilitySignedManifestArtifactReaderAdapter(
      fixture.digest,
    ).read({
      filePath: outputPath,
      expectedArtifactDigest: published.value.artifactDigest,
      expectedByteLength: published.value.byteLength,
    });
    expect(artifact.status).toBe(ResultStatus.Success);
    expect(await readFile(outputPath)).toHaveLength(published.value.byteLength);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
