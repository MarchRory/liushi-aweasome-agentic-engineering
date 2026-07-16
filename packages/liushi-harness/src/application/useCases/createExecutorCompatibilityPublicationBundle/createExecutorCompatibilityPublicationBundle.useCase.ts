import { rebuildExecutorCompatibilityRecord } from "#application/executorCompatibilityRecord/index.js";
import type {
  ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
  ExecutorCompatibilityEvidenceStore,
  ExecutorCompatibilityMatrixStore,
} from "#application/ports/index.js";
import { ResultStatus, type ContentDigest, type HarnessError, type Result } from "#common/index.js";
import type { ExecutorCompatibilityDigestPort } from "#domain/executorCompatibility/index.js";
import {
  createExecutorCompatibilityPublicationBundle,
  type ExecutorCompatibilityPublicationBundle,
  type ExecutorCompatibilityReleaseSubject,
} from "#domain/executorCompatibilityPublication/index.js";

/** 从精确 Matrix 创建 Publication Bundle 的输入。 */
export interface CreateExecutorCompatibilityPublicationBundleUseCaseInput {
  /** 调用方明确选择的 Matrix Digest。 */
  readonly matrixDigest: ContentDigest;
  /** npm 发布物与源码来源。 */
  readonly releaseSubject: ExecutorCompatibilityReleaseSubject;
}

/** 只读重建受信记录并生成确定性 Publication Bundle。 */
export class CreateExecutorCompatibilityPublicationBundleUseCase {
  public constructor(
    private readonly verifier: ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
    private readonly evidenceStore: ExecutorCompatibilityEvidenceStore,
    private readonly matrixStore: ExecutorCompatibilityMatrixStore,
    private readonly digestPort: ExecutorCompatibilityDigestPort,
  ) {}

  /** 不写文件、不联网、不签名，只返回完成摘要绑定的 Bundle。 */
  public async execute(
    input: CreateExecutorCompatibilityPublicationBundleUseCaseInput,
  ): Promise<Result<ExecutorCompatibilityPublicationBundle, HarnessError>> {
    const rebuilt = await rebuildExecutorCompatibilityRecord(input.matrixDigest, {
      verifier: this.verifier,
      evidenceStore: this.evidenceStore,
      matrixStore: this.matrixStore,
      digestPort: this.digestPort,
    });
    if (rebuilt.status === ResultStatus.Failure) return rebuilt;
    return createExecutorCompatibilityPublicationBundle(
      {
        releaseSubject: input.releaseSubject,
        matrix: rebuilt.value.matrix,
        policy: rebuilt.value.policy,
        projections: rebuilt.value.projections,
      },
      this.digestPort,
    );
  }
}
