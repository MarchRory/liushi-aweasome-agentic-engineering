import {
  CodexHookEvent,
  HarnessHookEvent,
  createCommandEnvelope,
  parsePostActionHookPayload,
  parsePreActionHookPayload,
  type ActionHookPayload,
  type CanonicalHookDispatcher,
  type CommandEnvelope,
  type CodexHookHandler,
  type CodexHookResponse,
  type HookWorkspaceBinding,
} from "#application/index.js";
import type {
  ActionJournalRepository,
  ContentDigestPort,
  HookBindingStore,
  TaskRepository,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  ActionKind,
  ActionOutcome,
  parseActionId,
  type ActionId,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";

import { CodexSupportedTool } from "../constants/index.js";
import type { CodexPostToolUseInput, CodexPreToolUseInput } from "../contracts/index.js";
import {
  classifyCodexToolOutcome,
  createCodexBasePayload,
  deriveCodexActionId,
  deriveCodexKey,
  parseCodexHookBindingIdentity,
  parseCodexIntentTargets,
  parseCodexSupportedTool,
  type CodexHookBindingIdentity,
} from "../factory/index.js";
import { deriveDeterministicHex } from "../identity/index.js";
import { mapCodexHookResponse } from "../mapper/index.js";
import { parseApplyPatchTargets, parseCodexHookInput } from "../validation/index.js";

/** 将 Codex PreToolUse/PostToolUse 映射为 Canonical Action Hook。 */
export class CodexHookAdapter implements CodexHookHandler {
  public constructor(
    private readonly dispatcher: CanonicalHookDispatcher,
    private readonly bindingStore: HookBindingStore,
    private readonly actionJournal: ActionJournalRepository,
    private readonly taskRepository: TaskRepository,
    private readonly digest: ContentDigestPort,
    private readonly clock: Clock,
  ) {}

  /** 解析 Codex 原始输入，构造稳定 Command，并返回 Codex 原生响应。 */
  public async execute(input: unknown): Promise<Result<CodexHookResponse, HarnessErrorType>> {
    const parsed = parseCodexHookInput(input);
    if (parsed.status === ResultStatus.Failure) return parsed;
    const binding = await this.bindingStore.find(parsed.value.cwd);
    if (binding.status === ResultStatus.Failure) return binding;
    const identity = parseCodexHookBindingIdentity(binding.value);
    if (identity.status === ResultStatus.Failure) return identity;
    const task = await this.taskRepository.load({
      workspaceId: identity.value.workspaceId,
      taskId: identity.value.taskId,
    });
    if (task.status === ResultStatus.Failure) return task;
    return parsed.value.hook_event_name === CodexHookEvent.PreToolUse
      ? this.handlePre(parsed.value, binding.value, identity.value)
      : this.handlePost(parsed.value, binding.value, identity.value);
  }

  private async handlePre(
    input: CodexPreToolUseInput,
    binding: HookWorkspaceBinding,
    identity: CodexHookBindingIdentity,
  ): Promise<Result<CodexHookResponse, HarnessErrorType>> {
    const tool = parseCodexSupportedTool(input.tool_name);
    if (tool !== CodexSupportedTool.ApplyPatch) {
      return invalid("当前 Codex Adapter 仅接管 apply_patch；其他工具由独立 Policy 处理。");
    }
    const patch = parseApplyPatchTargets(input.tool_input);
    if (patch.status === ResultStatus.Failure) return patch;
    const parsedActionId = parseActionId(deriveCodexActionId(binding, input));
    if (parsedActionId.status === ResultStatus.Failure) return parsedActionId;
    const actionId = parsedActionId.value;
    const existing = await this.loadOptionalAction(identity, actionId);
    if (existing.status === ResultStatus.Failure) return existing;
    const inputDigest = this.digest.calculate(input.tool_input);
    if (inputDigest.status === ResultStatus.Failure) return inputDigest;
    const postconditionDigest = this.digest.calculate({
      toolName: input.tool_name,
      toolUseId: input.tool_use_id,
      targets: patch.value.targets,
      expectedOutcome: "tool_completed",
    });
    if (postconditionDigest.status === ResultStatus.Failure) return postconditionDigest;
    const payload = parsePreActionHookPayload({
      ...createCodexBasePayload(
        input,
        binding,
        identity,
        actionId,
        existing.value?.intent.recordedAt,
        this.clock.now().toISOString(),
      ),
      event: HarnessHookEvent.PreAction,
      idempotencyKey:
        existing.value?.intent.idempotencyKey ?? deriveCodexKey(binding, input, "action"),
      actionKind: ActionKind.FileMutation,
      targets:
        existing.value === undefined
          ? patch.value.targets
          : parseCodexIntentTargets(existing.value),
      inputDigest: inputDigest.value,
      postconditionDigest: postconditionDigest.value,
      recoveryGuidance: "检查 apply_patch 目标、Git diff 和测试结果后交由 Human 决策。",
      planRiskArtifactId: identity.actionPlanRiskArtifactId,
      planRiskArtifactDigest: identity.actionPlanRiskArtifactDigest,
    });
    if (payload.status === ResultStatus.Failure) return payload;
    if (
      existing.value !== undefined &&
      existing.value.intent.inputDigest !== payload.value.inputDigest
    ) {
      return conflict("同一 Codex tool_use_id 的 PreToolUse 输入摘要发生变化。");
    }
    const command = this.createCommand(payload.value, 0, undefined);
    if (command.status === ResultStatus.Failure) return command;
    const result = await this.dispatcher.execute(command.value);
    return result.status === ResultStatus.Failure
      ? result
      : success(mapCodexHookResponse(result.value));
  }

  private async handlePost(
    input: CodexPostToolUseInput,
    binding: HookWorkspaceBinding,
    identity: CodexHookBindingIdentity,
  ): Promise<Result<CodexHookResponse, HarnessErrorType>> {
    const tool = parseCodexSupportedTool(input.tool_name);
    if (tool !== CodexSupportedTool.ApplyPatch) {
      return invalid("当前 Codex Adapter 仅接管 apply_patch；其他工具由独立 Policy 处理。");
    }
    const parsedActionId = parseActionId(deriveCodexActionId(binding, input));
    if (parsedActionId.status === ResultStatus.Failure) return parsedActionId;
    const actionId = parsedActionId.value;
    const loaded = await this.actionJournal.load({
      workspaceId: identity.workspaceId,
      taskId: identity.taskId,
      actionId,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;
    const patch = parseApplyPatchTargets(input.tool_input);
    if (patch.status === ResultStatus.Failure) return patch;
    const inputDigest = this.digest.calculate(input.tool_input);
    if (inputDigest.status === ResultStatus.Failure) return inputDigest;
    if (loaded.value.intent.inputDigest !== inputDigest.value) {
      return conflict("PostToolUse 输入摘要与 Action Intent 不一致。");
    }
    const outputDigest = this.digest.calculate(input.tool_response);
    if (outputDigest.status === ResultStatus.Failure) return outputDigest;
    const previousObservation = loaded.value.observations.at(-1);
    const outcome = previousObservation?.outcome ?? classifyCodexToolOutcome(input.tool_response);
    if (
      previousObservation?.outputDigest !== undefined &&
      previousObservation.outputDigest !== outputDigest.value
    ) {
      return conflict("同一 Codex tool_use_id 的 PostToolUse 输出摘要发生变化。");
    }
    const payload = parsePostActionHookPayload({
      ...createCodexBasePayload(
        input,
        binding,
        identity,
        actionId,
        previousObservation?.recordedAt ?? loaded.value.intent.recordedAt,
        this.clock.now().toISOString(),
      ),
      event: HarnessHookEvent.PostAction,
      causationId: loaded.value.intent.commandId,
      outcome,
      evidenceIds: previousObservation?.evidenceIds ?? [`codex:tool:${input.tool_use_id}`],
      outputDigest: outputDigest.value,
      ...(outcome === ActionOutcome.Succeeded
        ? {}
        : { errorCode: previousObservation?.errorCode ?? "codex_tool_failed" }),
      traceId: deriveDeterministicHex(`trace:${binding.workspaceRoot}:${input.tool_use_id}`, 32),
      spanId: deriveDeterministicHex(`span:${binding.workspaceRoot}:${input.tool_use_id}`, 16),
      toolName: input.tool_name,
      toolCallId: input.tool_use_id,
      startedAt: loaded.value.intent.recordedAt,
      endedAt: previousObservation?.recordedAt ?? loaded.value.intent.recordedAt,
    });
    if (payload.status === ResultStatus.Failure) return payload;
    const command = this.createCommand(
      payload.value,
      loaded.value.lastSequence,
      loaded.value.intent.commandId,
    );
    if (command.status === ResultStatus.Failure) return command;
    const result = await this.dispatcher.execute(command.value);
    return result.status === ResultStatus.Failure
      ? result
      : success(mapCodexHookResponse(result.value));
  }

  private createCommand(
    payload: ActionHookPayload,
    expectedVersion: number,
    causationId: string | undefined,
  ): Result<CommandEnvelope, HarnessErrorType> {
    const requestDigest = this.digest.calculate(payload);
    if (requestDigest.status === ResultStatus.Failure) return requestDigest;
    return createCommandEnvelope({
      commandId: String(payload["commandId"]),
      commandType: `hook.${String(payload["event"])}`,
      aggregateType: "action",
      aggregateId: String(payload["actionId"]),
      expectedVersion,
      idempotencyKey: String(payload["hookExecutionId"]),
      requestDigest: requestDigest.value,
      actor: payload.actor,
      authorizationContext: { executor: "codex" },
      correlationId: String(payload["correlationId"]),
      ...(causationId === undefined ? {} : { causationId }),
      submittedAt: String(payload["occurredAt"]),
      payload,
    });
  }

  private async loadOptionalAction(
    identity: CodexHookBindingIdentity,
    actionId: ActionId,
  ): Promise<Result<ActionJournalState | undefined, HarnessErrorType>> {
    const loaded = await this.actionJournal.load({
      workspaceId: identity.workspaceId,
      taskId: identity.taskId,
      actionId,
    });
    if (
      loaded.status === ResultStatus.Failure &&
      loaded.error.code === HarnessErrorCode.ActionNotFound
    ) {
      return success(undefined);
    }
    return loaded;
  }
}

function invalid(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}

function conflict(message: string): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.ActionConflict, message));
}
