import {
  createExecutorCompatibilitySignedAttestationArtifact,
  rebuildExecutorCompatibilityReleaseAttestationDraft,
  type ExecutorCompatibilitySignedAttestationArtifact,
} from "#application/executorCompatibilityAttestation/index.js";
import type {
  ContentDigestPort,
  ExecutorCompatibilityAttestationSignerPort,
} from "#application/ports/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import {
  IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
  type ExecutorCompatibilityReleaseAttestationDraft,
} from "#domain/executorCompatibilityAttestation/index.js";

/** 触发真实签名前必须提供的完整 G6 Draft。 */
export interface SignExecutorCompatibilityReleaseAttestationUseCaseInput {
  /** Human 已批准且调用方准备签名的完整 Draft。 */
  readonly draft: ExecutorCompatibilityReleaseAttestationDraft;
}

/** 将 G6 Draft 复验、Sigstore 签名和内容寻址 Artifact 创建串成单一操作。 */
export class SignExecutorCompatibilityReleaseAttestationUseCase {
  public constructor(
    private readonly signer: ExecutorCompatibilityAttestationSignerPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 只有完整重建成功后才允许进入可能联网的 Signer Port。 */
  public async execute(
    input: SignExecutorCompatibilityReleaseAttestationUseCaseInput,
  ): Promise<Result<ExecutorCompatibilitySignedAttestationArtifact, HarnessError>> {
    const draft = rebuildExecutorCompatibilityReleaseAttestationDraft(input.draft, this.digest);
    if (draft.status === ResultStatus.Failure) return draft;
    const signed = await this.signer.sign({
      payloadType: IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
      statement: draft.value.statement,
    });
    if (signed.status === ResultStatus.Failure) return signed;
    return createExecutorCompatibilitySignedAttestationArtifact(
      { draft: draft.value, sigstoreBundle: signed.value.sigstoreBundle },
      this.digest,
    );
  }
}
