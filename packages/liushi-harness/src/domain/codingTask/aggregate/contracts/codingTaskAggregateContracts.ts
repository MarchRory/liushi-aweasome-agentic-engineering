import type { CodingTaskAggregate } from "../../contracts/index.js";

/** CodingTask Aggregate 与最后事件序号的 Replay 结果。 */
export interface CodingTaskAggregateRecord {
  /** Replay 得到的 Aggregate。 */
  aggregate: CodingTaskAggregate;
  /** 最后应用的事件序号。 */
  lastSequence: number;
  /** 最后应用的事件哈希。 */
  lastEventHash: string;
}
