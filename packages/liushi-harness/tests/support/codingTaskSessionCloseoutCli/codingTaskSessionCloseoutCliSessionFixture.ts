import {
  CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
  CodingTaskCommandType,
  WORKTREE_PROVISION_COMMAND_TYPE,
  type CodingTaskExecutionAuthorization,
} from "../../../src/index.js";

import {
  CLOSEOUT_CLI_AGENT_ACTOR_ID,
  CLOSEOUT_CLI_BRANCH_NAME,
  CLOSEOUT_CLI_CODING_TASK_ID,
  CLOSEOUT_CLI_CORRELATION_ID,
  CLOSEOUT_CLI_REPOSITORY_ID,
  CLOSEOUT_CLI_SESSION_ID,
  CLOSEOUT_CLI_SOURCE_TASK_ID,
  CLOSEOUT_CLI_SUBMITTED_AT,
  CLOSEOUT_CLI_WORKSPACE_ID,
  CLOSEOUT_CLI_WORKTREE_ID,
  CLOSEOUT_CLI_WRITE_SET,
} from "./codingTaskSessionCloseoutCliConstants.js";
import { digestCloseoutCliValue } from "./codingTaskSessionCloseoutCliDigestFixture.js";

/** 构造供生产 Activation API 严格解析的 Session Manifest。 */
export function createCloseoutCliSessionManifest(input: {
  readonly repositoryRoot: string;
  readonly baseRevision: string;
  readonly executionAuthorization: CodingTaskExecutionAuthorization;
}): Record<string, unknown> {
  return {
    schemaVersion: CODING_TASK_SESSION_ACTIVATION_MANIFEST_SCHEMA_VERSION,
    sessionId: CLOSEOUT_CLI_SESSION_ID,
    createCommand: command(
      "closeout-session-create",
      CodingTaskCommandType.Create,
      0,
      {
        workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
        sourceTaskId: CLOSEOUT_CLI_SOURCE_TASK_ID,
        repositoryId: CLOSEOUT_CLI_REPOSITORY_ID,
        baseRevision: input.baseRevision,
        worktreeBinding: {
          worktreeId: CLOSEOUT_CLI_WORKTREE_ID,
          relativePath: "worktrees/session",
          branchName: CLOSEOUT_CLI_BRANCH_NAME,
          managed: true,
        },
        writeSet: CLOSEOUT_CLI_WRITE_SET,
        inputBindingSet: { bindings: [] },
        executionAuthorization: input.executionAuthorization,
      },
      CLOSEOUT_CLI_CODING_TASK_ID,
    ),
    provision: {
      command: command(
        "closeout-session-provision",
        WORKTREE_PROVISION_COMMAND_TYPE,
        1,
        {
          workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
          actionId: "01ARZ3NDEKTSV4RRFFQ69G5HAC",
          repositoryRootDigest: digestCloseoutCliValue({ repositoryRoot: input.repositoryRoot }),
        },
        CLOSEOUT_CLI_CODING_TASK_ID,
      ),
      runtime: { repositoryRoot: input.repositoryRoot },
    },
    startAttemptCommand: command(
      "closeout-session-start",
      CodingTaskCommandType.StartAttempt,
      1,
      { workspaceId: CLOSEOUT_CLI_WORKSPACE_ID, attemptNumber: 1 },
      CLOSEOUT_CLI_CODING_TASK_ID,
    ),
  };
}

/** 构造 Closeout CLI 输入的完整 Command Envelope。 */
export function createCloseoutCliCommand(): Record<string, unknown> {
  const payload = {
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    sessionId: CLOSEOUT_CLI_SESSION_ID,
  };
  return {
    schemaVersion: "1.0.0",
    commandId: "closeout-cli-command",
    commandType: "coding_task_session.closeout",
    aggregateType: "coding_task_session",
    aggregateId: CLOSEOUT_CLI_SESSION_ID,
    expectedVersion: 0,
    idempotencyKey: "closeout-cli-command",
    requestDigest: digestCloseoutCliValue(payload),
    actor: { kind: "agent", actorId: CLOSEOUT_CLI_AGENT_ACTOR_ID },
    authorizationContext: {},
    correlationId: CLOSEOUT_CLI_CORRELATION_ID,
    submittedAt: CLOSEOUT_CLI_SUBMITTED_AT,
    payload,
  };
}

function command(
  commandId: string,
  commandType: string,
  expectedVersion: number,
  payload: unknown,
  aggregateId: string,
) {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: digestCloseoutCliValue(payload),
    actor: { kind: "agent", actorId: CLOSEOUT_CLI_AGENT_ACTOR_ID },
    authorizationContext: {},
    correlationId: CLOSEOUT_CLI_CORRELATION_ID,
    submittedAt: CLOSEOUT_CLI_SUBMITTED_AT,
    payload,
  };
}
