import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { decodeSigstoreCertificateExtensionValue } from "../../src/infrastructure/index.js";

describe("Sigstore Certificate Extension", () => {
  it("解码规范 DER UTF8String 并保留完整 Unicode 文本", () => {
    const value = "https://github.com/MarchRory/liushi-aweasome-agentic-engineering/发布";

    const result = decodeSigstoreCertificateExtensionValue(encodeDerUtf8String(value));

    expect(result).toEqual({
      status: ResultStatus.Success,
      value,
    });
  });

  it("拒绝原始文本、错误 ASN.1 Tag 与尾随字节", () => {
    const candidates = [
      Buffer.from("github-hosted", "utf8"),
      Buffer.from([0x04, 0x03, 0x66, 0x6f, 0x6f]),
      Buffer.concat([encodeDerUtf8String("github-hosted"), Buffer.from([0x00])]),
    ];

    for (const candidate of candidates) {
      expect(decodeSigstoreCertificateExtensionValue(candidate)).toMatchObject({
        status: ResultStatus.Failure,
        error: {
          code: HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
        },
      });
    }
  });
});

function encodeDerUtf8String(value: string): Buffer {
  const content = Buffer.from(value, "utf8");
  if (content.length < 0x80) {
    return Buffer.concat([Buffer.from([0x0c, content.length]), content]);
  }
  return Buffer.concat([Buffer.from([0x0c, 0x81, content.length]), content]);
}
