import type {
  ExecutorCompatibilityAttestationSignerPort,
  ExecutorCompatibilityAttestationSigningResult,
  SignExecutorCompatibilityAttestationInput,
} from "#application/ports/executorCompatibilityAttestation/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";

import { defaultSigstoreAttestClient } from "../client/index.js";
import type { SigstoreAttestClient } from "../contracts/index.js";
import { serializeExecutorCompatibilityInTotoStatement } from "../serialization/index.js";
import { validateSigstoreAttestationBundle } from "../validation/index.js";

/** 使用官方 sigstore-js 生成 DSSE Attestation Bundle。 */
export class SigstoreExecutorCompatibilityAttestationSignerAdapter implements ExecutorCompatibilityAttestationSignerPort {
  public constructor(private readonly client: SigstoreAttestClient = defaultSigstoreAttestClient) {}

  /** 对规范 Statement 字节签名，并在返回前用官方 Parser 复验 Bundle。 */
  public async sign(
    input: SignExecutorCompatibilityAttestationInput,
  ): Promise<Result<ExecutorCompatibilityAttestationSigningResult, HarnessError>> {
    const payload = serializeExecutorCompatibilityInTotoStatement(input.statement);
    try {
      const signedBundle = await this.client(payload, input.payloadType);
      const validated = validateSigstoreAttestationBundle(
        signedBundle,
        payload,
        input.payloadType,
        HarnessErrorCode.ExecutorCompatibilityAttestationSigningFailed,
      );
      return validated.status === ResultStatus.Failure
        ? validated
        : success({ sigstoreBundle: validated.value.serializedBundle });
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.ExecutorCompatibilityAttestationSigningFailed,
          "Sigstore 无法生成 Executor Compatibility Attestation。",
          { causeName: error instanceof Error ? error.name : "UnknownError" },
          error,
        ),
      );
    }
  }
}
