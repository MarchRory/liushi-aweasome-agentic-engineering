import type { CodingTaskSessionCloseoutManager } from "../../../src/application/codingTaskSessionCloseout/index.js";
import type { CodingTaskSessionCloseoutState } from "../../../src/application/codingTaskSessionCloseoutState/index.js";
import type { HarnessError } from "../../../src/common/index.js";
import type { ActionOutcome } from "../../../src/domain/actionJournal/index.js";

import type { CloseoutManagerAuthorityOptions } from "./codingTaskSessionCloseoutManagerAuthorityFixture.js";

/** Manager 夹具可注入的失败与既有状态。 */
export interface CloseoutManagerHarnessOptions extends CloseoutManagerAuthorityOptions {
  /** Checkpoint 的结构化执行结果。 */
  readonly checkpointOutcome?: ActionOutcome;
  /** Repository Lock 释放是否失败。 */
  readonly releaseFailure?: boolean;
  /** Closeout Store 中预先存在的状态。 */
  readonly existingState?: CodingTaskSessionCloseoutState;
  /** Checkpoint inspect 的确定失败。 */
  readonly checkpointInspectFailure?: HarnessError;
  /** Checkpoint execute 返回的失败序列。 */
  readonly checkpointFailures?: readonly HarnessError[];
  /** Coverage 只读调用返回的失败序列。 */
  readonly coverageFailures?: readonly HarnessError[];
  /** Snapshot 只读调用返回的失败序列。 */
  readonly snapshotFailures?: readonly HarnessError[];
  /** State replace 指定版本的一次性失败。 */
  readonly replaceFailures?: Readonly<Record<string, readonly HarnessError[]>>;
  /** pre-lock Activation load 是否抛出错误。 */
  readonly preLockActivationThrow?: HarnessError;
  /** Repository Lock acquire 返回的确定失败。 */
  readonly lockAcquireFailure?: HarnessError;
  /** Managed Worktree Path Port 返回的 Root。 */
  readonly resolvedWorktreeRoot?: string;
  /** Checkpoint execute 是否直接抛出异常。 */
  readonly checkpointExecuteThrow?: Error;
  /** Admission 依次返回的注入失败。 */
  readonly admissionFailures?: readonly HarnessError[];
  /** 让 Coverage target 无法覆盖 Snapshot changed path。 */
  readonly coverageTargetMismatch?: boolean;
  /** 仅让 bind 校验 Checkpoint binding digest 时抛错。 */
  readonly checkpointBindingDigestThrow?: boolean;
  /** clock.now 第几次调用时抛错，按 1 起算。 */
  readonly clockNowFailureAt?: number;
}

/** Manager 夹具记录的稳定调用计数。 */
export interface CloseoutManagerHarnessCalls {
  /** Activation load 总次数。 */
  activationLoad: number;
  /** Repository Lock acquire 次数。 */
  lockAcquire: number;
  /** Admission 关闭次数。 */
  admission: number;
  /** Coverage 构建次数。 */
  coverage: number;
  /** Snapshot 检查次数。 */
  snapshot: number;
  /** Checkpoint execute 次数。 */
  checkpointExecute: number;
  /** State replace 次数。 */
  stateReplace: number;
}

/** 可观察 Closeout Manager 运行状态的测试夹具。 */
export interface CloseoutManagerHarness {
  /** 被测 Manager。 */
  readonly manager: CodingTaskSessionCloseoutManager;
  /** 按发生顺序记录的操作。 */
  readonly events: readonly string[];
  /** 关键端口调用计数。 */
  readonly calls: CloseoutManagerHarnessCalls;
  /** 当前持久化 State。 */
  readonly state: CodingTaskSessionCloseoutState | null;
}
