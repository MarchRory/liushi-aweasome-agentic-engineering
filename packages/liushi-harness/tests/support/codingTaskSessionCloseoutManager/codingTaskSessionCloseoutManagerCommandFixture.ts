import {
  createCommandEnvelope,
  type CommandEnvelope,
} from "../../../src/application/command/index.js";
import {
  CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
  CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
  type CodingTaskSessionCloseoutPayload,
} from "../../../src/application/codingTaskSessionCloseout/index.js";
import { ActorKind, type ContentDigest } from "../../../src/common/index.js";
import { digestOf, unwrap } from "../codingTaskSessionCloseout/index.js";
import {
  closeoutManagerSessionId,
  closeoutManagerWorkspaceId,
} from "./codingTaskSessionCloseoutManagerAuthorityFixture.js";

/** Closeout Command 夹具允许覆盖的信封字段。 */
export interface CloseoutManagerCommandOverrides {
  /** 可替换的 Payload Digest。 */
  readonly requestDigest?: ContentDigest;
  /** 可替换的 Aggregate ID。 */
  readonly aggregateId?: string;
  /** 可替换的预期版本。 */
  readonly expectedVersion?: number;
  /** 可替换的 Agent Actor ID。 */
  readonly actorId?: string;
  /** 可替换的提交时间。 */
  readonly submittedAt?: string;
}

/** 创建仅包含 Workspace 与 Session 的合法 Closeout Payload。 */
export function createCloseoutManagerPayload(): CodingTaskSessionCloseoutPayload {
  return {
    workspaceId: closeoutManagerWorkspaceId,
    sessionId: closeoutManagerSessionId,
  };
}

/** 创建请求摘要、Aggregate 与 Actor 默认一致的 Closeout Command。 */
export function createCloseoutManagerCommand(
  payload: unknown = createCloseoutManagerPayload(),
  overrides: CloseoutManagerCommandOverrides = {},
): CommandEnvelope<unknown> {
  return unwrap(
    createCommandEnvelope({
      commandId: "closeout-command",
      commandType: CODING_TASK_SESSION_CLOSEOUT_COMMAND_TYPE,
      aggregateType: CODING_TASK_SESSION_CLOSEOUT_AGGREGATE_TYPE,
      aggregateId: overrides.aggregateId ?? closeoutManagerSessionId,
      expectedVersion: overrides.expectedVersion ?? 0,
      idempotencyKey: "closeout-idempotency",
      requestDigest: overrides.requestDigest ?? digestOf(payload),
      actor: {
        kind: ActorKind.Agent,
        actorId: overrides.actorId ?? "closeout-agent",
      },
      authorizationContext: {},
      correlationId: "closeout-correlation",
      submittedAt: overrides.submittedAt ?? "2026-07-26T00:00:00.000Z",
      payload,
    }),
  );
}
