import type {
  ExecutorCompatibilityReleaseArtifactWriteResult,
  ExecutorCompatibilitySignedAttestationArtifactWriterPort,
} from "#application/ports/executorCompatibilityReleaseArtifactWriter/index.js";
import type { ExecutorCompatibilityReleaseDraftReaderPort } from "#application/ports/executorCompatibilityReleaseDraftReader/index.js";
import type { HarnessError, Result } from "#common/index.js";
import { ResultStatus } from "#common/index.js";

import type {
  PublishExecutorCompatibilityReleaseAttestationUseCaseInput,
  SignExecutorCompatibilityReleaseAttestationBoundary,
} from "./contracts/index.js";

/** 按 Reader、Sign、Writer 顺序发布 Attestation Artifact。 */
export class PublishExecutorCompatibilityReleaseAttestationUseCase {
  /** 创建 Attestation 发布用例。 */
  public constructor(
    /** 读取并重建 Draft 的端口。 */
    private readonly draftReader: ExecutorCompatibilityReleaseDraftReaderPort,
    /** 仅依赖 execute 方法的签名边界。 */
    private readonly signUseCase: SignExecutorCompatibilityReleaseAttestationBoundary,
    /** create-only 写入 Artifact 的端口。 */
    private readonly writer: ExecutorCompatibilitySignedAttestationArtifactWriterPort,
  ) {}

  /** 按 Reader、Sign、Writer 顺序执行并在失败时短路。 */
  public async execute(
    input: PublishExecutorCompatibilityReleaseAttestationUseCaseInput,
  ): Promise<Result<ExecutorCompatibilityReleaseArtifactWriteResult, HarnessError>> {
    const draft = await this.draftReader.readAttestationDraft({
      draftFilePath: input.draftFilePath,
    });
    if (draft.status === ResultStatus.Failure) return draft;
    const signed = await this.signUseCase.execute({ draft: draft.value });
    if (signed.status === ResultStatus.Failure) return signed;
    return this.writer.write({ artifact: signed.value, outputFilePath: input.outputFilePath });
  }
}
