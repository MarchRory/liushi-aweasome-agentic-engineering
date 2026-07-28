import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { CodingTaskAggregate } from "#domain/codingTask/index.js";

/** 从权威 CodingTask 与 Closeout Snapshot 创建 Checkpoint 输入所需的数据。 */
export interface CodingTaskSessionCheckpointInputFactoryInput {
  /** 可信 Repository 绝对根目录。 */
  readonly repositoryRoot: string;
  /** 当前权威 CodingTask Aggregate。 */
  readonly aggregate: CodingTaskAggregate;
  /** 已持久化并完成摘要验证的提交前 Snapshot。 */
  readonly snapshot: NonNullable<CodingTaskSessionCloseoutState["snapshot"]>;
}
