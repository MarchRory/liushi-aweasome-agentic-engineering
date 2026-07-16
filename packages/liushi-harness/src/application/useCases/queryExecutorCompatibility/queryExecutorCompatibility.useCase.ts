import type {
  ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
  ExecutorCompatibilityEvidenceStore,
  ExecutorCompatibilityMatrixStore,
} from "#application/ports/index.js";
import { rebuildExecutorCompatibilityRecord } from "#application/executorCompatibilityRecord/index.js";
import {
  ResultStatus,
  success,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  type ExecutorCompatibilityDigestPort,
  type ExecutorCompatibilityMatrix,
} from "#domain/executorCompatibility/index.js";

/** 经完整重编译确认可信的 Executor Compatibility 查询结果。 */
export interface QueryExecutorCompatibilityOutput {
  /** 从源码固定 Policy 与确定性复验 Evidence 重编译得到的 Matrix。 */
  readonly matrix: ExecutorCompatibilityMatrix;
  /** 标记返回值来自本次完整重编译。 */
  readonly recomputed: true;
}

/** 按来自受信编译边界的精确 Matrix Digest 读取并重新证明内容完整性。 */
export class QueryExecutorCompatibilityUseCase {
  public constructor(
    private readonly verifier: ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
    private readonly evidenceStore: ExecutorCompatibilityEvidenceStore,
    private readonly matrixStore: ExecutorCompatibilityMatrixStore,
    private readonly digestPort: ExecutorCompatibilityDigestPort,
  ) {}

  /** 锚定源码 Policy，重新投影 Evidence，并拒绝任何持久化内容漂移。 */
  public async execute(
    matrixDigest: ContentDigest,
  ): Promise<Result<QueryExecutorCompatibilityOutput, HarnessError>> {
    const rebuilt = await rebuildExecutorCompatibilityRecord(matrixDigest, {
      verifier: this.verifier,
      evidenceStore: this.evidenceStore,
      matrixStore: this.matrixStore,
      digestPort: this.digestPort,
    });
    return rebuilt.status === ResultStatus.Failure
      ? rebuilt
      : success({ matrix: rebuilt.value.matrix, recomputed: true });
  }
}
