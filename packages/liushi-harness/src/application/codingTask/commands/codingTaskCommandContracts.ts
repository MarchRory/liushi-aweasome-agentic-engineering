import type { CommandEnvelope } from "#application/command/index.js";
import type {
  CodingTaskAttemptOutcome,
  CodingTaskControlAction,
  CodingTaskCreatedPayload,
  CodingTaskHumanResolution,
  CodingTaskVerificationOutcome,
} from "#domain/codingTask/index.js";
import type { FailureTaxonomy, InputBindingSet } from "#domain/workflow/index.js";

import type { CodingTaskCommandType } from "./codingTaskCommandEnums.js";

/** 创建 CodingTask 的命令载荷。 */
export interface CreateCodingTaskPayload extends CodingTaskCreatedPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
}

/** 开始 Attempt 的命令载荷。 */
export interface StartAttemptPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
  /** 要开始的 Attempt 序号。 */
  attemptNumber: number;
}

/** 完成 Attempt 的命令载荷。 */
export interface FinishAttemptPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
  /** 要完成的 Attempt 序号。 */
  attemptNumber: number;
  /** 实现尝试结果。 */
  outcome: CodingTaskAttemptOutcome;
  /** 明确失败时的失败分类。 */
  failureTaxonomy?: FailureTaxonomy;
}

/** 请求 Verification 的命令载荷。 */
export interface RequestVerificationPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
  /** 要验证的 Attempt 序号。 */
  attemptNumber: number;
}

/** 完成 Verification 的命令载荷。 */
export interface FinishVerificationPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
  /** 被验证的 Attempt 序号。 */
  attemptNumber: number;
  /** Verification 结果。 */
  outcome: CodingTaskVerificationOutcome;
  /** 明确失败时的失败分类。 */
  failureTaxonomy?: FailureTaxonomy;
}

/** Human 控制命令载荷。 */
export interface ControlCodingTaskPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
  /** Human 控制动作。 */
  action: CodingTaskControlAction;
}

/** Human 处理阻塞命令载荷。 */
export interface ResolveHumanPayload {
  /** CodingTask 所属 Workspace。 */
  workspaceId: string;
  /** Human 对阻塞 Attempt 的处置动作。 */
  resolution: CodingTaskHumanResolution;
  /** 恢复实现时重新确认的输入绑定。 */
  inputBindingSet?: InputBindingSet;
}

/** 将 CodingTask Command Type 与对应 Payload 绑定。 */
export interface CodingTaskCommandPayloadByType {
  /** Create 命令对应的载荷。 */
  [CodingTaskCommandType.Create]: CreateCodingTaskPayload;
  /** StartAttempt 命令对应的载荷。 */
  [CodingTaskCommandType.StartAttempt]: StartAttemptPayload;
  /** FinishAttempt 命令对应的载荷。 */
  [CodingTaskCommandType.FinishAttempt]: FinishAttemptPayload;
  /** RequestVerification 命令对应的载荷。 */
  [CodingTaskCommandType.RequestVerification]: RequestVerificationPayload;
  /** FinishVerification 命令对应的载荷。 */
  [CodingTaskCommandType.FinishVerification]: FinishVerificationPayload;
  /** Control 命令对应的载荷。 */
  [CodingTaskCommandType.Control]: ControlCodingTaskPayload;
  /** ResolveHuman 命令对应的载荷。 */
  [CodingTaskCommandType.ResolveHuman]: ResolveHumanPayload;
}

/** CodingTask Command Payload 联合类型。 */
export type CodingTaskCommandPayload = CodingTaskCommandPayloadByType[CodingTaskCommandType];

/** 带有编译期 Type/Payload 关联的 CodingTask Command。 */
export type CodingTaskCommand<TType extends CodingTaskCommandType = CodingTaskCommandType> = {
  [TCommandType in TType]: Omit<
    CommandEnvelope<CodingTaskCommandPayloadByType[TCommandType]>,
    "commandType"
  > & {
    commandType: TCommandType;
  };
}[TType];
