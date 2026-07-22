import {
  createExecutorCompatibilitySignedAttestationArtifact,
  rebuildExecutorCompatibilityReleaseAttestationDraft,
  type ExecutorCompatibilitySignedAttestationArtifact,
} from "#application/executorCompatibilityAttestation/index.js";
import { validateExecutorCompatibilityReleaseApprovalVerificationReceipt } from "#application/executorCompatibilityReleaseApproval/index.js";
import type { ExecutorCompatibilityAttestationSignerPort } from "#application/ports/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseApprovalAuthorityPort } from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import {
  ExecutorCompatibilityReleaseApprovalSubject,
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
    private readonly approvalAuthority: ExecutorCompatibilityReleaseApprovalAuthorityPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 只有 Draft 与可信审批源同时复验成功后才允许进入可能联网的 Signer Port。 */
  public async execute(
    input: SignExecutorCompatibilityReleaseAttestationUseCaseInput,
  ): Promise<Result<ExecutorCompatibilitySignedAttestationArtifact, HarnessError>> {
    const draft = rebuildExecutorCompatibilityReleaseAttestationDraft(input.draft, this.digest);
    if (draft.status === ResultStatus.Failure) return draft;

    const authorityInput = {
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
      artifactDigest: draft.value.releaseCandidate.candidateDigest,
    } as const;
    const trustedApproval = await this.approvalAuthority.verifyTrustedApproval(authorityInput);
    if (trustedApproval.status === ResultStatus.Failure) return trustedApproval;
    const validatedApproval = validateExecutorCompatibilityReleaseApprovalVerificationReceipt(
      {
        authorityInput,
        receipt: trustedApproval.value,
        expected: {
          decisionRequest: draft.value.decisionRequest,
          approvalRecord: draft.value.approvalRecord,
        },
      },
      this.digest,
    );
    if (validatedApproval.status === ResultStatus.Failure) return validatedApproval;

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
