import type { CommandInvocationProvenance } from "#application/command/index.js";
import type { HarnessError, Result } from "#common/index.js";

import type {
  SessionPostActionHookPayload,
  SessionPreActionHookPayload,
} from "./hook.contracts.js";

/** Session Hook Handler 提交 Action Journal 后返回的稳定版本。 */
export interface SessionActionHookHandlerSuccess {
  /** 当前 Action Journal 的已提交版本。 */
  readonly committedVersion: number;
}

/** Session Hook Handler 的单次调用上下文。 */
export interface SessionActionHookHandlerInput<TPayload> {
  /** 已通过 Canonical Schema 校验的 Session Payload。 */
  readonly payload: TPayload;
  /** 调用方声明的 Action Journal 版本。 */
  readonly expectedVersion: number;
  /** Codex Adapter 生成的脱敏调用来源证明。 */
  readonly invocationProvenance: CommandInvocationProvenance;
}

/** 在同一 Session Admission Lock 内处理 Pre/PostAction 的窄端口。 */
export interface SessionActionHookHandlerPort {
  /** 原子校验 Session 状态并记录 Action Intent。 */
  admitPreAction(
    input: SessionActionHookHandlerInput<SessionPreActionHookPayload>,
  ): Promise<Result<SessionActionHookHandlerSuccess, HarnessError>>;
  /** 复验已准入 Action，并记录 Trace、Observation 与 Resolution。 */
  recordPostAction(
    input: SessionActionHookHandlerInput<SessionPostActionHookPayload>,
  ): Promise<Result<SessionActionHookHandlerSuccess, HarnessError>>;
}
