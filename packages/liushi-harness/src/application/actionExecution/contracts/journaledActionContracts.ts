import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type {
  ActionIntentRecord,
  ActionJournalState,
  ActionOutcome,
} from "#domain/actionJournal/index.js";

import type { JournaledActionDisposition } from "../enums/index.js";

/** 一次外部副作用调用产生的结构化观察结果。 */
export interface ActionExecutionResult {
  /** 能由当前证据支持的副作用结果。 */
  readonly outcome: ActionOutcome;
  /** 支撑结果判定的 Evidence ID。 */
  readonly evidenceIds: readonly string[];
  /** 可选的规范化输出摘要。 */
  readonly outputDigest?: ContentDigest;
  /** 失败或未知结果的稳定错误码。 */
  readonly errorCode?: string;
}

/** 执行一个已注册副作用的 Port。 */
export interface ActionExecutorPort<TInput> {
  /** 执行一次副作用并返回可写入 Journal 的观察结果。 */
  execute(input: TInput): Promise<Result<ActionExecutionResult, HarnessError>>;
}

/** JournaledActionRunner 的输入。 */
export interface JournaledActionRunInput<TInput> {
  /** 执行前必须落盘的完整 Intent。 */
  readonly intent: ActionIntentRecord;
  /** 只传给具体 Executor、不会写入 Journal 的运行时输入。 */
  readonly executionInput: TInput;
}

/** JournaledActionRunner 的闭合输出。 */
export interface JournaledActionRunOutput {
  /** 本次调用后的权威 Action Journal State。 */
  readonly state: ActionJournalState;
  /** 本次是否实际执行、复用、允许重试或等待 Human。 */
  readonly disposition: JournaledActionDisposition;
}
