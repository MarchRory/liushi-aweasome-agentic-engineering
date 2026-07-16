import type {
  ExecutorCompatibilityPublicationWriterPort,
  ExecutorCompatibilityPublicationWriteResult,
} from "#application/ports/index.js";
import {
  type CreateExecutorCompatibilityPublicationBundleUseCase,
  type CreateExecutorCompatibilityPublicationBundleUseCaseInput,
} from "#application/useCases/createExecutorCompatibilityPublicationBundle/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

/** 创建并原子发布 Executor Compatibility Bundle 的输入。 */
export interface PublishExecutorCompatibilityPublicationBundleUseCaseInput extends CreateExecutorCompatibilityPublicationBundleUseCaseInput {
  /** 不允许被覆盖的规范绝对输出路径。 */
  readonly outputFilePath: string;
}

/** 将只读 Bundle 创建与不可变文件发布串成单一 Application 操作。 */
export class PublishExecutorCompatibilityPublicationBundleUseCase {
  public constructor(
    private readonly bundleCreator: CreateExecutorCompatibilityPublicationBundleUseCase,
    private readonly writer: ExecutorCompatibilityPublicationWriterPort,
  ) {}

  /** 先重新证明并创建 Bundle，成功后才进入原子文件发布边界。 */
  public async execute(
    input: PublishExecutorCompatibilityPublicationBundleUseCaseInput,
  ): Promise<Result<ExecutorCompatibilityPublicationWriteResult, HarnessError>> {
    const bundle = await this.bundleCreator.execute({
      matrixDigest: input.matrixDigest,
      releaseSubject: input.releaseSubject,
    });
    if (bundle.status === ResultStatus.Failure) return bundle;
    return this.writer.write({ bundle: bundle.value, outputFilePath: input.outputFilePath });
  }
}
