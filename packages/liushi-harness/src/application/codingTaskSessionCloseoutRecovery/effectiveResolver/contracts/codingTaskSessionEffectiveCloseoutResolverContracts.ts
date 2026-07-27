import type { ChangeSetCheckpoint } from "#application/changeSetCheckpoint/index.js";
import type { CodingTaskSessionCloseoutRecoveryState } from "#application/codingTaskSessionCloseoutRecovery/state/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryStateStore,
  CodingTaskSessionCloseoutStateStore,
  ContentDigestPort,
} from "#application/ports/index.js";
import type { HarnessError, Result } from "#common/index.js";

import type {
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
  CodingTaskSessionEffectiveCloseoutUnresolvedReason,
} from "../enums/index.js";

/** Effective Closeout Resolver 的只读依赖集合。 */
export interface CodingTaskSessionEffectiveCloseoutResolverDependencies {
  /** 原 Closeout State 的只读 Store。 */
  readonly closeoutStateStore: CodingTaskSessionEffectiveCloseoutStateReader;
  /** Recovery State 的只读查询 Store。 */
  readonly recoveryStateStore: CodingTaskSessionEffectiveCloseoutRecoveryStateReader;
  /** 用于复算完整原 Closeout State 摘要的 Port。 */
  readonly digest: ContentDigestPort;
}

/** Resolver 可读取原 Closeout State 的最小能力。 */
export type CodingTaskSessionEffectiveCloseoutStateReader = Pick<
  CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>,
  "load"
>;

/** Resolver 可查询 Recovery State 的最小能力。 */
export type CodingTaskSessionEffectiveCloseoutRecoveryStateReader = Pick<
  CodingTaskSessionCloseoutRecoveryStateStore<CodingTaskSessionCloseoutRecoveryState>,
  "find"
>;

/** 已解析的 Effective Closeout。 */
export interface CodingTaskSessionEffectiveCloseoutResolved {
  /** 解析状态。 */
  readonly status: CodingTaskSessionEffectiveCloseoutStatus.Resolved;
  /** Checkpoint 的权威来源。 */
  readonly source: CodingTaskSessionEffectiveCloseoutSource;
  /** 已通过跨模型绑定校验的 Checkpoint。 */
  readonly checkpoint: ChangeSetCheckpoint;
}

/** 未解析的 Effective Closeout。 */
export interface CodingTaskSessionEffectiveCloseoutUnresolved {
  /** 解析状态。 */
  readonly status: CodingTaskSessionEffectiveCloseoutStatus.Unresolved;
  /** 稳定的未解析原因。 */
  readonly reason: CodingTaskSessionEffectiveCloseoutUnresolvedReason;
}

/** Effective Closeout Resolver 的 Result DTO。 */
export type CodingTaskSessionEffectiveCloseoutResolution =
  CodingTaskSessionEffectiveCloseoutResolved | CodingTaskSessionEffectiveCloseoutUnresolved;

/** Effective Closeout Resolver 的公开接口契约。 */
export interface CodingTaskSessionEffectiveCloseoutResolverPort {
  /** 严格解析 Workspace/Session，并返回有效 Checkpoint 或稳定未解析原因。 */
  resolve(
    input: unknown,
  ): Promise<Result<CodingTaskSessionEffectiveCloseoutResolution, HarnessError>>;
}
