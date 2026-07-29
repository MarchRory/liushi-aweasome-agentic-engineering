import { describe, expect, it } from "vitest";

import {
  CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
  CodexHookEvent,
  CommandStatus,
  createCommandReceipt,
  createSessionHookBinding,
  HarnessHookEvent,
  HookDecision,
  SESSION_HOOK_BINDING_SCHEMA_VERSION,
  type SessionHookBinding,
} from "../../src/application/index.js";
import {
  CodexHookAdapter,
  CodexPermissionMode,
  createCodexBasePayload,
  createCodexInvocationContext,
  createCodexInvocationScopeId,
  parseCodexHookBindingIdentity,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  ActorKind,
  failure,
  parseContentDigest,
  success,
  type Clock,
  type ContentDigest,
} from "../../src/common/index.js";
import {
  ActionJournalRecordType,
  ActionJournalSchemaVersion,
  ActionJournalStatus,
  ActionKind,
  parseActionId,
  type ActionJournalState,
} from "../../src/domain/actionJournal/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const clock: Clock = { now: () => new Date("2026-07-23T00:00:00.000Z") };
const input = {
  session_id: "host-session",
  cwd: "C:/workspace",
  hook_event_name: CodexHookEvent.PreToolUse as CodexHookEvent.PreToolUse,
  model: "host-model",
  permission_mode: CodexPermissionMode.Default,
  turn_id: "host-turn",
  transcript_path: null,
  tool_name: "apply_patch",
  tool_use_id: "tool-1",
  tool_input: {
    command: "*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** End Patch",
  },
};

describe("Codex Session Hook projection", () => {
  it("按 v2 Binding 生成 1.1.0，并区分执行器 session 与 Harness sessionContext", () => {
    const binding = createBinding();
    const identity = parseCodexHookBindingIdentity(binding);
    expect(identity.status).toBe(ResultStatus.Success);
    if (identity.status === ResultStatus.Failure) return;

    const payload = createCodexBasePayload(
      input,
      binding,
      identity.value,
      "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      contentDigest("1"),
      undefined,
      "2026-07-23T00:00:00.000Z",
    );

    expect(payload).toMatchObject({
      schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
      sessionId: input.session_id,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      actor: { actorId: binding.actorId },
      sessionContext: {
        sessionId: binding.sessionId,
        sessionBindingDigest: binding.sessionBindingDigest,
      },
    });
  });

  it("仅在 v2 scope 中加入 sessionBindingDigest，并隔离 v1/v2 actionId", () => {
    const binding = createBinding();
    const common = {
      workspaceRoot: binding.workspaceRoot,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      invocationId: contentDigest("2"),
    };
    const legacyScope = createCodexInvocationScopeId(common, digest);
    const sessionScope = createCodexInvocationScopeId(
      { ...common, sessionBindingDigest: bindingDigest(binding) },
      digest,
    );
    expect(legacyScope.status).toBe(ResultStatus.Success);
    expect(sessionScope.status).toBe(ResultStatus.Success);
    if (
      legacyScope.status === ResultStatus.Failure ||
      sessionScope.status === ResultStatus.Failure
    ) {
      return;
    }
    expect(sessionScope.value).not.toBe(legacyScope.value);

    const legacyContext = createCodexInvocationContext(
      { hookInput: input, targets: ["src/a.ts"], inputDigest: contentDigest("3"), ...common },
      digest,
    );
    const sessionContext = createCodexInvocationContext(
      {
        hookInput: input,
        targets: ["src/a.ts"],
        inputDigest: contentDigest("3"),
        ...common,
        sessionBindingDigest: bindingDigest(binding),
      },
      digest,
    );
    expect(legacyContext.status).toBe(ResultStatus.Success);
    expect(sessionContext.status).toBe(ResultStatus.Success);
    if (
      legacyContext.status === ResultStatus.Failure ||
      sessionContext.status === ResultStatus.Failure
    ) {
      return;
    }
    expect(sessionContext.value.actionId).not.toBe(legacyContext.value.actionId);
  });

  it("Adapter 从 v2 Binding 投影 Canonical 版本，不会降级为 v1", async () => {
    const binding = createBinding();
    let command: unknown;
    const receipt = createCommandReceipt({
      commandId: "command-1",
      requestDigest: contentDigest("4"),
      status: CommandStatus.Committed,
      committedVersion: 1,
    });
    expect(receipt.status).toBe(ResultStatus.Success);
    if (receipt.status === ResultStatus.Failure) return;
    const adapter = new CodexHookAdapter(
      {
        execute: (value) => {
          command = value;
          return Promise.resolve(
            success({
              schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
              event: HarnessHookEvent.PreAction,
              decision: HookDecision.Allow,
              reason: "allowed",
              receipt: receipt.value,
            }),
          );
        },
      },
      { find: () => Promise.resolve(success(binding)) },
      {
        load: () =>
          Promise.resolve(
            failure(
              new HarnessError(HarnessErrorCode.ActionNotFound, "Action 不存在。", {
                workspaceId: binding.workspaceId,
                taskId: binding.taskId,
              }),
            ),
          ),
      },
      { load: () => Promise.resolve(success({})) },
      digest,
      clock,
    );

    const result = await adapter.execute(input);
    expect(result).toEqual({ status: ResultStatus.Success, value: {} });
    expect(command).toMatchObject({
      payload: {
        schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
        sessionId: input.session_id,
        workspaceId: binding.workspaceId,
        taskId: binding.taskId,
        actor: { actorId: binding.actorId },
        planRiskArtifactId: binding.planRiskArtifactId,
        planRiskArtifactDigest: binding.planRiskArtifactDigest,
        sessionContext: {
          sessionId: binding.sessionId,
          sessionBindingDigest: binding.sessionBindingDigest,
        },
      },
    });
    expect(command).not.toMatchObject({ payload: { schemaVersion: "1.0.0" } });
  });

  it("v2 Post 拒绝被伪装成同一 action 的 legacy Intent", async () => {
    const binding = createBinding();
    const actionId = parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FAW");
    expect(actionId.status).toBe(ResultStatus.Success);
    if (actionId.status === ResultStatus.Failure) return;
    const legacyState = createLegacyState(binding, actionId.value);
    const adapter = new CodexHookAdapter(
      {
        execute: () =>
          Promise.resolve(
            failure(new HarnessError(HarnessErrorCode.InvalidInput, "不应调用 Dispatcher。")),
          ),
      },
      { find: () => Promise.resolve(success(binding)) },
      { load: () => Promise.resolve(success(legacyState)) },
      { load: () => Promise.resolve(success({})) },
      digest,
      clock,
    );

    const result = await adapter.execute({
      ...input,
      hook_event_name: CodexHookEvent.PostToolUse,
      tool_response: { success: true },
    });
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: "action_conflict" },
    });
  });
});

function createBinding(): SessionHookBinding {
  const result = createSessionHookBinding(
    {
      schemaVersion: SESSION_HOOK_BINDING_SCHEMA_VERSION,
      workspaceRoot: "C:/workspace",
      workspaceId: "workspace-v2",
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      planRiskArtifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAT",
      planRiskArtifactDigest: contentDigest("a"),
      actorId: "persistent-actor",
      boundAt: "2026-07-23T00:00:00.000Z",
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAQ",
      codingTaskId: "coding-task-v2",
      attemptNumber: 1,
      worktreeId: "worktree-v2",
      worktreeRootDigest: contentDigest("b"),
      activationBindingDigest: contentDigest("c"),
    },
    digest,
  );
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function contentDigest(letter: string): ContentDigest {
  return `sha256:${letter.repeat(64)}` as ContentDigest;
}

function bindingDigest(binding: SessionHookBinding): ContentDigest {
  const parsed = parseContentDigest(binding.sessionBindingDigest);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function createLegacyState(
  binding: SessionHookBinding,
  actionId: ActionJournalState["intent"]["actionId"],
): ActionJournalState {
  return {
    intent: {
      schemaVersion: ActionJournalSchemaVersion.Legacy,
      recordType: ActionJournalRecordType.Intent,
      actionId,
      sequence: 1,
      workspaceId: binding.workspaceId as ActionJournalState["intent"]["workspaceId"],
      taskId: binding.taskId as ActionJournalState["intent"]["taskId"],
      commandId: "legacy-command",
      correlationId: "legacy-correlation",
      idempotencyKey: "legacy-idempotency",
      kind: ActionKind.FileMutation,
      target: JSON.stringify(["src/a.ts"]),
      inputDigest: contentDigest("3"),
      postconditionDigest: contentDigest("4"),
      recoveryGuidance: "legacy recovery",
      actor: { kind: ActorKind.Agent, actorId: binding.actorId },
      recordedAt: "2026-07-23T00:00:00.000Z",
    },
    observations: [],
    resolutions: [],
    lastSequence: 1,
    status: ActionJournalStatus.IntentRecorded,
  };
}
