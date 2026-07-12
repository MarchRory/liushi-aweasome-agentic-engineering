import type { ActorRef, ContentDigest } from "#common/index.js";

import type {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  COMMAND_RECEIPT_SCHEMA_VERSION,
} from "./commandConstants.js";
import type { CommandErrorCode, CommandStatus } from "./commandEnums.js";

/** Command 契约允许承载的 JSON 原子值。 */
export type CommandJsonPrimitive = string | number | boolean | null;

/** Command 契约允许承载的递归 JSON 值。 */
export type CommandJsonValue =
  CommandJsonPrimitive | readonly CommandJsonValue[] | { readonly [key: string]: CommandJsonValue };

/** Command 的授权上下文；只承载可序列化的声明，不代表授权决策本身。 */
export type AuthorizationContext = Readonly<Record<string, CommandJsonValue>>;

/** Versioned Application Command 的完整信封。 */
export interface CommandEnvelope<TPayload = unknown> {
  /** Command Envelope 的 Schema 版本。 */
  schemaVersion: typeof COMMAND_ENVELOPE_SCHEMA_VERSION;
  /** 本次 Command 请求的稳定标识。 */
  commandId: string;
  /** 描述业务意图的稳定 Command Type。 */
  commandType: string;
  /** 被写入 Aggregate 的稳定类型。 */
  aggregateType: string;
  /** 被写入 Aggregate 的稳定标识。 */
  aggregateId: string;
  /** 调用方期望 Aggregate 处于的版本。 */
  expectedVersion: number;
  /** 防止同一副作用被重复执行的稳定幂等键。 */
  idempotencyKey: string;
  /** 对请求内容计算出的 SHA-256 摘要。 */
  requestDigest: ContentDigest;
  /** 发起 Command 的 Actor 声明。 */
  actor: ActorRef;
  /** 由外部身份边界提供的授权上下文声明。 */
  authorizationContext: AuthorizationContext;
  /** 将同一业务流程中的多个 Command 关联起来的标识。 */
  correlationId: string;
  /** 直接触发本次 Command 的上游标识；根 Command 可以省略。 */
  causationId?: string;
  /** Command 被提交时的 ISO 8601 时间。 */
  submittedAt: string;
  /** Command 的业务输入。 */
  payload: TPayload;
}

/** 构造 Command Envelope 时使用的输入；Schema 版本省略时使用当前版本。 */
export interface CommandEnvelopeInput<TPayload = unknown> {
  /** 可选的显式 Schema 版本，用于拒绝未来或未知版本。 */
  schemaVersion?: string;
  /** 本次 Command 请求的稳定标识。 */
  commandId: string;
  /** 描述业务意图的稳定 Command Type。 */
  commandType: string;
  /** 被写入 Aggregate 的稳定类型。 */
  aggregateType: string;
  /** 被写入 Aggregate 的稳定标识。 */
  aggregateId: string;
  /** 调用方期望 Aggregate 处于的版本。 */
  expectedVersion: number;
  /** 防止同一副作用被重复执行的稳定幂等键。 */
  idempotencyKey: string;
  /** 对请求内容计算出的 SHA-256 摘要。 */
  requestDigest: string;
  /** 发起 Command 的 Actor 声明。 */
  actor: ActorRef;
  /** 由外部身份边界提供的授权上下文声明。 */
  authorizationContext: AuthorizationContext;
  /** 将同一业务流程中的多个 Command 关联起来的标识。 */
  correlationId: string;
  /** 直接触发本次 Command 的上游标识；根 Command 可以省略。 */
  causationId?: string;
  /** Command 被提交时的 ISO 8601 时间。 */
  submittedAt: string;
  /** Command 的业务输入。 */
  payload: TPayload;
}

/** 描述 Command 执行结果的稳定回执。 */
export interface CommandReceipt {
  /** Command Receipt 的 Schema 版本。 */
  schemaVersion: typeof COMMAND_RECEIPT_SCHEMA_VERSION;
  /** 与原始 Command 对应的稳定标识。 */
  commandId: string;
  /** Command 的最终业务结果状态。 */
  status: CommandStatus;
  /** Receipt 对应的原始请求摘要。 */
  requestDigest: ContentDigest;
  /** committed 时产生的 Aggregate 版本。 */
  committedVersion?: number;
  /** rejected、conflict 或 outcomeUnknown 时的稳定错误分类。 */
  errorCode?: CommandErrorCode;
  /** 面向调用方的非敏感错误说明。 */
  errorMessage?: string;
  /** duplicate 时对应的首次 Command ID。 */
  duplicateOfCommandId?: string;
}

/** 构造 Command Receipt 时使用的输入；Schema 版本省略时使用当前版本。 */
export interface CommandReceiptInput {
  /** 可选的显式 Schema 版本，用于拒绝未来或未知版本。 */
  schemaVersion?: string;
  /** 与原始 Command 对应的稳定标识。 */
  commandId: string;
  /** Receipt 对应的原始请求摘要。 */
  requestDigest: string;
  /** Command 的最终业务结果状态。 */
  status: CommandStatus;
  /** committed 时产生的 Aggregate 版本。 */
  committedVersion?: number;
  /** rejected、conflict 或 outcomeUnknown 时的稳定错误分类。 */
  errorCode?: CommandErrorCode;
  /** 面向调用方的非敏感错误说明。 */
  errorMessage?: string;
  /** duplicate 时对应的首次 Command ID。 */
  duplicateOfCommandId?: string;
}
