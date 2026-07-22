import { ASN1Obj } from "@sigstore/core";

import { failure, HarnessError, HarnessErrorCode, success, type Result } from "#common/index.js";

const ASN1_UTF8_STRING_TAG_NUMBER = 0x0c;

/** 解码 Fulcio v2 自定义证书扩展使用的 DER UTF8String。 */
export function decodeSigstoreCertificateExtensionValue(
  encodedValue: Buffer,
): Result<string, HarnessError> {
  try {
    const encoded = Buffer.from(encodedValue);
    const parsed = ASN1Obj.parseBuffer(encoded);
    if (
      !parsed.tag.isUniversal() ||
      parsed.tag.constructed ||
      parsed.tag.number !== ASN1_UTF8_STRING_TAG_NUMBER ||
      !parsed.toDER().equals(encoded)
    ) {
      return invalidCertificateExtension();
    }
    return success(new TextDecoder("utf-8", { fatal: true }).decode(parsed.value));
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
        "Sigstore 证书扩展不是规范 DER UTF8String。",
        { causeName: error instanceof Error ? error.name : "UnknownError" },
        error,
      ),
    );
  }
}

function invalidCertificateExtension(): Result<never, HarnessError> {
  return failure(
    new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityAttestationVerificationFailed,
      "Sigstore 证书扩展不是规范 DER UTF8String。",
    ),
  );
}
