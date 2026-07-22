import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionActivationRecord } from "#domain/codingTaskSession/index.js";

import type {
  CodingTaskSessionActivationCreateResult,
  CodingTaskSessionActivationLocator,
} from "./contracts/index.js";

/** 外部 Agent CodingTask Session Activation Record 的不可变 Repository Port。 */
export interface CodingTaskSessionActivationRepository {
  /** 仅创建指定 Session ID 的 Record，重复调用必须幂等或返回 Conflict。 */
  create(
    record: CodingTaskSessionActivationRecord,
  ): Promise<Result<CodingTaskSessionActivationCreateResult, HarnessError>>;
  /** 按已校验 Workspace 与 Session ID 加载并重新进行领域重建。 */
  load(
    locator: CodingTaskSessionActivationLocator,
  ): Promise<Result<CodingTaskSessionActivationRecord, HarnessError>>;
}
