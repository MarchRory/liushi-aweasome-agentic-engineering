import {
  createExecutorCompatibilitySignedReleaseManifestArtifact,
  type ExecutorCompatibilitySignedReleaseManifestArtifact,
} from "#application/executorCompatibilityReleaseManifestAttestation/index.js";
import { validateExecutorCompatibilityReleaseApprovalVerificationReceipt } from "#application/executorCompatibilityReleaseApproval/index.js";
import type { ExecutorCompatibilityAttestationSignerPort } from "#application/ports/executorCompatibilityAttestation/index.js";
import type { ExecutorCompatibilityReleaseApprovalAuthorityPort } from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import {
  ExecutorCompatibilityReleaseApprovalSubject,
  IN_TOTO_ATTESTATION_PAYLOAD_TYPE,
} from "#domain/executorCompatibilityAttestation/index.js";
import {
  rebuildExecutorCompatibilityReleaseManifestAttestationDraft,
  type ExecutorCompatibilityReleaseManifestAttestationDraft,
} from "#domain/executorCompatibilityReleaseManifestAttestation/index.js";

/** 触发签名前必须提供的完整 Release Manifest Attestation Draft。 */
export interface SignExecutorCompatibilityReleaseManifestUseCaseInput {
  /** Human 已批准且调用方准备签名的完整 Draft。 */
  readonly draft: ExecutorCompatibilityReleaseManifestAttestationDraft;
}

/** 将 Manifest Draft 复验、签名和内容寻址 Artifact 创建串成单一操作。 */
export class SignExecutorCompatibilityReleaseManifestUseCase {
  public constructor(
    private readonly signer: ExecutorCompatibilityAttestationSignerPort,
    private readonly approvalAuthority: ExecutorCompatibilityReleaseApprovalAuthorityPort,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 只有 Draft 与可信审批源同时复验成功后才允许进入可能联网的 Signer Port。 */
  public async execute(
    input: SignExecutorCompatibilityReleaseManifestUseCaseInput,
  ): Promise<Result<ExecutorCompatibilitySignedReleaseManifestArtifact, HarnessError>> {
    const draft = rebuildExecutorCompatibilityReleaseManifestAttestationDraft(
      input.draft,
      this.digest,
    );
    if (draft.status === ResultStatus.Failure) return draft;

    const authorityInput = {
      approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
      artifactDigest: draft.value.manifest.manifestDigest,
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

    return createExecutorCompatibilitySignedReleaseManifestArtifact(
      { draft: draft.value, sigstoreBundle: signed.value.sigstoreBundle },
      this.digest,
    );
  }
}
