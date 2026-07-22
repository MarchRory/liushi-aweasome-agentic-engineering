import { bundleFromJSON, bundleToJSON, isBundleWithDsseEnvelope } from "@sigstore/bundle";

import {
  failure,
  HarnessError,
  success,
  type HarnessErrorCode,
  type Result,
} from "#common/index.js";

import { SIGSTORE_BUNDLE_V03_MEDIA_TYPE } from "../constants/index.js";
import type { ValidatedSigstoreAttestationBundle } from "../contracts/index.js";

/** 使用官方 Parser 校验 Bundle v0.3、单签名 DSSE 与精确 Payload。 */
export function validateSigstoreAttestationBundle(
  input: unknown,
  expectedPayload: Buffer,
  expectedPayloadType: string,
  failureCode: HarnessErrorCode,
): Result<ValidatedSigstoreAttestationBundle, HarnessError> {
  try {
    const bundle = bundleFromJSON(input);
    if (
      bundle.mediaType !== SIGSTORE_BUNDLE_V03_MEDIA_TYPE ||
      !isBundleWithDsseEnvelope(bundle) ||
      bundle.content.dsseEnvelope.signatures.length !== 1 ||
      bundle.content.dsseEnvelope.payloadType !== expectedPayloadType ||
      !Buffer.from(bundle.content.dsseEnvelope.payload).equals(expectedPayload)
    ) {
      return invalidBundle(failureCode, "Sigstore Bundle 未绑定精确 DSSE Statement。");
    }
    const serializedBundle = bundleToJSON(bundle);
    if (
      typeof serializedBundle !== "object" ||
      serializedBundle === null ||
      serializedBundle.mediaType !== SIGSTORE_BUNDLE_V03_MEDIA_TYPE
    ) {
      return invalidBundle(failureCode, "Sigstore Bundle 无法规范化为 v0.3 JSON。");
    }
    return success({
      bundle,
      serializedBundle,
    });
  } catch (error) {
    return failure(
      new HarnessError(
        failureCode,
        "Sigstore Bundle 结构或 protobuf JSON 非法。",
        { causeName: errorName(error) },
        error,
      ),
    );
  }
}

function invalidBundle(code: HarnessErrorCode, message: string): Result<never, HarnessError> {
  return failure(new HarnessError(code, message));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
