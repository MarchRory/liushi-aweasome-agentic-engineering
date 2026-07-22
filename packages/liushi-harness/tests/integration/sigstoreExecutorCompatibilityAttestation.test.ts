import { afterEach, describe, expect, it } from "vitest";

import {
  SignExecutorCompatibilityReleaseAttestationUseCase,
  VerifyExecutorCompatibilityReleaseAttestationUseCase,
} from "../../src/application/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { createExecutorCompatibilityPublisherIdentityPolicy } from "../../src/domain/executorCompatibilityAttestation/index.js";
import {
  SigstoreExecutorCompatibilityAttestationSignerAdapter,
  SigstoreExecutorCompatibilityAttestationVerifierAdapter,
} from "../../src/infrastructure/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  createPublisherIdentityPolicyInput,
  createSigstoreAttestationTestEnvironment,
  createStrictExecutorCompatibilityAttestationDraft,
  SigstoreAttestationTestMode,
  type SigstoreAttestationTestEnvironment,
} from "../support/executorCompatibility/index.js";

let activeEnvironment: SigstoreAttestationTestEnvironment | undefined;

const SIGSTORE_ATTESTATION_TEST_MODES = [
  {
    label: "默认 Rekor v1 Inclusion Promise",
    mode: SigstoreAttestationTestMode.DefaultRekorV1,
  },
  {
    label: "Rekor v2 Inclusion Proof 与 RFC 3161 TSA",
    mode: SigstoreAttestationTestMode.RekorV2WithTsa,
  },
] as const;

afterEach(() => {
  activeEnvironment?.restore();
  activeEnvironment = undefined;
});

describe("Sigstore Executor Compatibility Attestation", () => {
  it.each(SIGSTORE_ATTESTATION_TEST_MODES)(
    "使用 $label 签名后在完全禁网状态验证 DSSE、证书、CT、TLog 与身份",
    async ({ mode }) => {
      const fixture = await createExecutorCompatibilityAttestationFixture();
      const environment = await createSigstoreAttestationTestEnvironment(fixture, mode);
      activeEnvironment = environment;
      const signer = new SigstoreExecutorCompatibilityAttestationSignerAdapter(
        environment.attestClient,
      );
      const verifier = new SigstoreExecutorCompatibilityAttestationVerifierAdapter();
      const signing = new SignExecutorCompatibilityReleaseAttestationUseCase(
        signer,
        fixture.digest,
      );
      const verification = new VerifyExecutorCompatibilityReleaseAttestationUseCase(
        verifier,
        fixture.digest,
      );

      const signed = await signing.execute({
        draft: createStrictExecutorCompatibilityAttestationDraft(fixture),
      });
      expect(signed.status).toBe(ResultStatus.Success);
      if (signed.status === ResultStatus.Failure) throw signed.error;

      environment.disconnectSigningServices();
      const verified = await verification.execute({
        artifact: signed.value,
        trustedRoot: environment.trustedRoot,
      });

      if (verified.status === ResultStatus.Failure) throw verified.error;
      expect(verified.status).toBe(ResultStatus.Success);
      expect(verified.value).toMatchObject({
        artifactDigest: signed.value.artifactDigest,
        statementDigest: signed.value.statementDigest,
        sigstoreBundleDigest: signed.value.sigstoreBundleDigest,
        releaseCandidateDigest: fixture.releaseCandidate.candidateDigest,
        signerIdentity: {
          certificateIssuer: fixture.publisherIdentityPolicy.certificateIssuer,
          certificateIdentity: fixture.publisherIdentityPolicy.certificateIdentity.value,
          certificateExtensions: fixture.publisherIdentityPolicy.certificateExtensions,
        },
      });

      const alternatePolicy = createExecutorCompatibilityPublisherIdentityPolicy(
        createPublisherIdentityPolicyInput(
          fixture.releaseSubject.repositoryUri,
          fixture.releaseSubject.sourceRevision,
          fixture.publisherIdentityPolicy.certificateIdentity.value.replace(
            "release.yml",
            "publish.yml",
          ),
        ),
        fixture.digest,
      );
      if (alternatePolicy.status === ResultStatus.Failure) throw alternatePolicy.error;
      const wrongIdentity = await verifier.verify({
        sigstoreBundle: signed.value.sigstoreBundle,
        trustedRoot: environment.trustedRoot,
        statement: fixture.statement,
        publisherIdentityPolicy: alternatePolicy.value,
      });
      expect(wrongIdentity).toMatchObject({
        status: ResultStatus.Failure,
        error: {
          code: HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
        },
      });

      const tamperedPayload = await verifier.verify({
        sigstoreBundle: replaceDssePayload(signed.value.sigstoreBundle),
        trustedRoot: environment.trustedRoot,
        statement: fixture.statement,
        publisherIdentityPolicy: fixture.publisherIdentityPolicy,
      });
      expect(tamperedPayload).toMatchObject({
        status: ResultStatus.Failure,
        error: {
          code: HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
        },
      });
    },
  );
});

function replaceDssePayload(
  bundle: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> & { readonly mediaType: string } {
  const clone = structuredClone(bundle);
  const envelope = readObject(clone, "dsseEnvelope");
  envelope["payload"] = Buffer.from("tampered", "utf8").toString("base64");
  if (typeof clone["mediaType"] !== "string") {
    throw new Error("测试 Sigstore Bundle 缺少 mediaType。");
  }
  return clone as Readonly<Record<string, unknown>> & { readonly mediaType: string };
}

function readObject(
  parent: Readonly<Record<string, unknown>>,
  key: string,
): Record<string, unknown> {
  const value = parent[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`测试 Sigstore Bundle 字段 ${key} 不是对象。`);
  }
  return value as Record<string, unknown>;
}
