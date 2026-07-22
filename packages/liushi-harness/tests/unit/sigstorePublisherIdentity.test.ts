import { generateKeyPairSync } from "node:crypto";

import type { ObjectIdentifierValuePair } from "@sigstore/protobuf-specs";
import type { Signer } from "@sigstore/verify";
import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import type { ExecutorCompatibilityPublisherIdentityPolicy } from "../../src/domain/executorCompatibilityAttestation/index.js";
import { extractVerifiedSigstorePublisherIdentity } from "../../src/infrastructure/index.js";
import { createExecutorCompatibilityAttestationFixture } from "../support/executorCompatibility/index.js";

describe("Sigstore Publisher Identity", () => {
  it("返回从证书实际解码的 Policy 受管扩展并忽略标准证书扩展", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const signer = createSigner(fixture.publisherIdentityPolicy, [
      {
        oid: { id: [2, 5, 29, 19] },
        value: Buffer.from([0x30, 0x00]),
      },
    ]);

    const result = extractVerifiedSigstorePublisherIdentity(
      signer,
      fixture.publisherIdentityPolicy,
    );

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        certificateIssuer: fixture.publisherIdentityPolicy.certificateIssuer,
        certificateIdentity: fixture.publisherIdentityPolicy.certificateIdentity.value,
        certificateExtensions: fixture.publisherIdentityPolicy.certificateExtensions,
      },
    });
  });

  it("同一 Policy OID 在证书中重复时关闭失败", async () => {
    const fixture = await createExecutorCompatibilityAttestationFixture();
    const duplicate = createPolicyOidValues(fixture.publisherIdentityPolicy)[0];
    if (duplicate === undefined) throw new Error("测试 Publisher Identity Policy 缺少 OID。");
    const signer = createSigner(fixture.publisherIdentityPolicy, [duplicate]);

    const result = extractVerifiedSigstorePublisherIdentity(
      signer,
      fixture.publisherIdentityPolicy,
    );

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
      },
    });
  });
});

function createSigner(
  policy: ExecutorCompatibilityPublisherIdentityPolicy,
  additionalOids: readonly ObjectIdentifierValuePair[],
): Signer {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    key: publicKey,
    identity: {
      extensions: { issuer: policy.certificateIssuer },
      subjectAlternativeName: policy.certificateIdentity.value,
      oids: [...createPolicyOidValues(policy), ...additionalOids],
    },
  };
}

function createPolicyOidValues(
  policy: ExecutorCompatibilityPublisherIdentityPolicy,
): ObjectIdentifierValuePair[] {
  return policy.certificateExtensions.map((extension) => ({
    oid: { id: extension.oid.split(".").map(Number) },
    value: encodeDerUtf8String(extension.value),
  }));
}

function encodeDerUtf8String(value: string): Buffer {
  const content = Buffer.from(value, "utf8");
  if (content.length < 0x80) {
    return Buffer.concat([Buffer.from([0x0c, content.length]), content]);
  }
  if (content.length <= 0xff) {
    return Buffer.concat([Buffer.from([0x0c, 0x81, content.length]), content]);
  }
  throw new Error("测试 DER UTF8String 超出单字节长度编码范围。");
}
