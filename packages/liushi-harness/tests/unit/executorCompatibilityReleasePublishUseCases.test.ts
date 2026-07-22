import { describe, expect, it } from "vitest";

import { createExecutorCompatibilitySignedReleaseManifestArtifact } from "../../src/application/executorCompatibilityReleaseManifestAttestation/index.js";
import { createExecutorCompatibilitySignedAttestationArtifact } from "../../src/application/executorCompatibilityAttestation/index.js";
import {
  ExecutorCompatibilityReleaseArtifactWriteDisposition,
  ExecutorCompatibilityStoredReleaseArtifactKind,
  type ExecutorCompatibilityReleaseArtifactWriteResult,
  type ExecutorCompatibilitySignedAttestationArtifactWriterPort,
  type ExecutorCompatibilitySignedManifestArtifactWriterPort,
} from "../../src/application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import type { ExecutorCompatibilityReleaseDraftReaderPort } from "../../src/application/ports/executorCompatibilityReleaseDraftReader/index.js";
import {
  PublishExecutorCompatibilityReleaseAttestationUseCase,
  type SignExecutorCompatibilityReleaseAttestationBoundary,
} from "../../src/application/useCases/publishExecutorCompatibilityReleaseAttestation/index.js";
import {
  PublishExecutorCompatibilityReleaseManifestUseCase,
  type SignExecutorCompatibilityReleaseManifestBoundary,
} from "../../src/application/useCases/publishExecutorCompatibilityReleaseManifest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
} from "../../src/common/index.js";
import { createExecutorCompatibilityAttestationFixture } from "../support/executorCompatibility/executorCompatibilityAttestationFixture.js";
import { createExecutorCompatibilityReleaseManifestAttestationFixture } from "../support/executorCompatibility/executorCompatibilityReleaseManifestAttestationFixture.js";
import {
  createExecutorCompatibilitySigstoreBundleStub,
  createStrictExecutorCompatibilityAttestationDraft,
} from "../support/executorCompatibility/executorCompatibilitySignedAttestationTestHelpers.js";

const error = new HarnessError(HarnessErrorCode.InvalidInput, "test");

describe("attestation release publish use case", () => {
  it("按 Reader -> Sign -> Writer 顺序成功执行", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const artifact = createExecutorCompatibilitySignedAttestationArtifact(
      {
        draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub(),
      },
      fixture.digest,
    );
    if (artifact.status === ResultStatus.Failure) throw artifact.error;
    const events: string[] = [];
    const reader: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => {
        events.push("read");
        return Promise.resolve(success(createStrictExecutorCompatibilityAttestationDraft(fixture)));
      },
      readManifestDraft: () => Promise.reject(new Error("unused")),
    };
    const signUseCase: SignExecutorCompatibilityReleaseAttestationBoundary = {
      execute: () => {
        events.push("sign");
        return Promise.resolve(success(artifact.value));
      },
    };
    const writeResult = createWriteResult(
      ExecutorCompatibilityStoredReleaseArtifactKind.SignedAttestation,
      artifact.value.artifactDigest,
    );
    const writer: ExecutorCompatibilitySignedAttestationArtifactWriterPort = {
      write: () => {
        events.push("write");
        return Promise.resolve(success(writeResult));
      },
    };
    const result = await new PublishExecutorCompatibilityReleaseAttestationUseCase(
      reader,
      signUseCase,
      writer,
    ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" });
    expect(result).toEqual({ status: ResultStatus.Success, value: writeResult });
    expect(events).toEqual(["read", "sign", "write"]);
  });

  it("Reader 失败时不调用 Sign 和 Writer", async () => {
    let readerCalls = 0;
    let signCalls = 0;
    let writerCalls = 0;
    const reader: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => {
        readerCalls += 1;
        return Promise.resolve(failure(error));
      },
      readManifestDraft: () => Promise.reject(new Error("unused")),
    };
    const signUseCase: SignExecutorCompatibilityReleaseAttestationBoundary = {
      execute: () => {
        signCalls += 1;
        return Promise.reject(new Error("unexpected"));
      },
    };
    const writer: ExecutorCompatibilitySignedAttestationArtifactWriterPort = {
      write: () => {
        writerCalls += 1;
        return Promise.reject(new Error("unexpected"));
      },
    };
    const result = await new PublishExecutorCompatibilityReleaseAttestationUseCase(
      reader,
      signUseCase,
      writer,
    ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" });
    expect(result).toEqual(failure(error));
    expect({ readerCalls, signCalls, writerCalls }).toEqual({
      readerCalls: 1,
      signCalls: 0,
      writerCalls: 0,
    });
  });

  it("Sign 失败时不调用 Writer，并原样返回 Writer 失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const draft = createStrictExecutorCompatibilityAttestationDraft(fixture);
    let readerCalls = 0;
    let signCalls = 0;
    let writerCalls = 0;
    const reader: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => {
        readerCalls += 1;
        return Promise.resolve(success(draft));
      },
      readManifestDraft: () => Promise.reject(new Error("unused")),
    };
    const signUseCase: SignExecutorCompatibilityReleaseAttestationBoundary = {
      execute: () => {
        signCalls += 1;
        return Promise.resolve(failure(error));
      },
    };
    let writes = 0;
    const writer: ExecutorCompatibilitySignedAttestationArtifactWriterPort = {
      write: () => {
        writes += 1;
        writerCalls += 1;
        return Promise.reject(new Error("unexpected"));
      },
    };
    const signedFailure = await new PublishExecutorCompatibilityReleaseAttestationUseCase(
      reader,
      signUseCase,
      writer,
    ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" });
    expect(signedFailure).toEqual(failure(error));
    expect(writes).toBe(0);
    expect({ readerCalls, signCalls, writerCalls }).toEqual({
      readerCalls: 1,
      signCalls: 1,
      writerCalls: 0,
    });
    const artifact = createExecutorCompatibilitySignedAttestationArtifact(
      { draft, sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() },
      fixture.digest,
    );
    if (artifact.status === ResultStatus.Failure) throw artifact.error;
    readerCalls = 0;
    signCalls = 0;
    writerCalls = 0;
    const writerError = new HarnessError(HarnessErrorCode.IoFailure, "writer");
    const failedWriter: ExecutorCompatibilitySignedAttestationArtifactWriterPort = {
      write: () => {
        writerCalls += 1;
        return Promise.resolve(failure(writerError));
      },
    };
    const successfulSign: SignExecutorCompatibilityReleaseAttestationBoundary = {
      execute: () => {
        signCalls += 1;
        return Promise.resolve(success(artifact.value));
      },
    };
    const writerFailure = await new PublishExecutorCompatibilityReleaseAttestationUseCase(
      reader,
      successfulSign,
      failedWriter,
    ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" });
    expect(writerFailure).toEqual(failure(writerError));
    expect({ readerCalls, signCalls, writerCalls }).toEqual({
      readerCalls: 1,
      signCalls: 1,
      writerCalls: 1,
    });
  });
});

describe("manifest release publish use case", () => {
  it("按 Reader -> Sign -> Writer 顺序成功执行并短路两类失败", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const artifact = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: fixture.manifestAttestationDraft,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub(),
      },
      fixture.digest,
    );
    if (artifact.status === ResultStatus.Failure) throw artifact.error;
    const events: string[] = [];
    const reader: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => Promise.reject(new Error("unused")),
      readManifestDraft: () => {
        events.push("read");
        return Promise.resolve(success(fixture.manifestAttestationDraft));
      },
    };
    const signUseCase: SignExecutorCompatibilityReleaseManifestBoundary = {
      execute: () => {
        events.push("sign");
        return Promise.resolve(success(artifact.value));
      },
    };
    const writeResult = createWriteResult(
      ExecutorCompatibilityStoredReleaseArtifactKind.SignedManifest,
      artifact.value.artifactDigest,
    );
    const writer: ExecutorCompatibilitySignedManifestArtifactWriterPort = {
      write: () => {
        events.push("write");
        return Promise.resolve(success(writeResult));
      },
    };
    const result = await new PublishExecutorCompatibilityReleaseManifestUseCase(
      reader,
      signUseCase,
      writer,
    ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" });
    expect(result).toEqual({ status: ResultStatus.Success, value: writeResult });
    expect(events).toEqual(["read", "sign", "write"]);
  });

  it("Reader 失败、Sign 失败、Writer 失败均按边界短路并原样返回", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const draft = fixture.manifestAttestationDraft;
    const artifact = createExecutorCompatibilitySignedReleaseManifestArtifact(
      { draft, sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub() },
      fixture.digest,
    );
    if (artifact.status === ResultStatus.Failure) throw artifact.error;
    const reader: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => Promise.reject(new Error("unused")),
      readManifestDraft: () => Promise.resolve(failure(error)),
    };
    const signUseCase: SignExecutorCompatibilityReleaseManifestBoundary = {
      execute: () => Promise.resolve(failure(error)),
    };
    const writer: ExecutorCompatibilitySignedManifestArtifactWriterPort = {
      write: () => Promise.resolve(failure(error)),
    };
    expect(
      await new PublishExecutorCompatibilityReleaseManifestUseCase(
        reader,
        signUseCase,
        writer,
      ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" }),
    ).toEqual(failure(error));
    const readerSuccess: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => Promise.reject(new Error("unused")),
      readManifestDraft: () => Promise.resolve(success(draft)),
    };
    expect(
      await new PublishExecutorCompatibilityReleaseManifestUseCase(
        readerSuccess,
        signUseCase,
        writer,
      ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" }),
    ).toEqual(failure(error));
    const writerError = new HarnessError(HarnessErrorCode.IoFailure, "writer");
    const successfulSign: SignExecutorCompatibilityReleaseManifestBoundary = {
      execute: () => Promise.resolve(success(artifact.value)),
    };
    const failedWriter: ExecutorCompatibilitySignedManifestArtifactWriterPort = {
      write: () => Promise.resolve(failure(writerError)),
    };
    expect(
      await new PublishExecutorCompatibilityReleaseManifestUseCase(
        readerSuccess,
        successfulSign,
        failedWriter,
      ).execute({ draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" }),
    ).toEqual(failure(writerError));
  });
  it("分别统计 Manifest 的 Reader、Sign、Writer 失败边界", async () => {
    const fixture = await createExecutorCompatibilityReleaseManifestAttestationFixture();
    const artifact = createExecutorCompatibilitySignedReleaseManifestArtifact(
      {
        draft: fixture.manifestAttestationDraft,
        sigstoreBundle: createExecutorCompatibilitySigstoreBundleStub(),
      },
      fixture.digest,
    );
    if (artifact.status === ResultStatus.Failure) throw artifact.error;
    const input = { draftFilePath: "C:\\draft.json", outputFilePath: "C:\\out.json" };
    let readerCalls = 0;
    let signCalls = 0;
    let writerCalls = 0;
    const readerFailure: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => Promise.reject(new Error("unused")),
      readManifestDraft: () => {
        readerCalls += 1;
        return Promise.resolve(failure(error));
      },
    };
    const signFailure: SignExecutorCompatibilityReleaseManifestBoundary = {
      execute: () => {
        signCalls += 1;
        return Promise.resolve(failure(error));
      },
    };
    const writerFailure: ExecutorCompatibilitySignedManifestArtifactWriterPort = {
      write: () => {
        writerCalls += 1;
        return Promise.resolve(failure(error));
      },
    };
    expect(
      await new PublishExecutorCompatibilityReleaseManifestUseCase(
        readerFailure,
        signFailure,
        writerFailure,
      ).execute(input),
    ).toEqual(failure(error));
    expect({ readerCalls, signCalls, writerCalls }).toEqual({
      readerCalls: 1,
      signCalls: 0,
      writerCalls: 0,
    });
    readerCalls = 0;
    signCalls = 0;
    writerCalls = 0;
    const readerSuccess: ExecutorCompatibilityReleaseDraftReaderPort = {
      readAttestationDraft: () => Promise.reject(new Error("unused")),
      readManifestDraft: () => {
        readerCalls += 1;
        return Promise.resolve(success(fixture.manifestAttestationDraft));
      },
    };
    expect(
      await new PublishExecutorCompatibilityReleaseManifestUseCase(
        readerSuccess,
        signFailure,
        writerFailure,
      ).execute(input),
    ).toEqual(failure(error));
    expect({ readerCalls, signCalls, writerCalls }).toEqual({
      readerCalls: 1,
      signCalls: 1,
      writerCalls: 0,
    });
    readerCalls = 0;
    signCalls = 0;
    writerCalls = 0;
    const successfulSign: SignExecutorCompatibilityReleaseManifestBoundary = {
      execute: () => {
        signCalls += 1;
        return Promise.resolve(success(artifact.value));
      },
    };
    expect(
      await new PublishExecutorCompatibilityReleaseManifestUseCase(
        readerSuccess,
        successfulSign,
        writerFailure,
      ).execute(input),
    ).toEqual(failure(error));
    expect({ readerCalls, signCalls, writerCalls }).toEqual({
      readerCalls: 1,
      signCalls: 1,
      writerCalls: 1,
    });
  });
});

function createWriteResult(
  kind: ExecutorCompatibilityStoredReleaseArtifactKind,
  artifactDigest: string,
): ExecutorCompatibilityReleaseArtifactWriteResult {
  return {
    kind,
    disposition: ExecutorCompatibilityReleaseArtifactWriteDisposition.Created,
    artifactDigest:
      artifactDigest as ExecutorCompatibilityReleaseArtifactWriteResult["artifactDigest"],
    byteLength: 1,
    outputFilePath: "C:\\out.json",
    schemaVersion: "test",
  };
}
