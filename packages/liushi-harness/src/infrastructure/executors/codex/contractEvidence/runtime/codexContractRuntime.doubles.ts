import {
  CANONICAL_HOOK_SCHEMA_VERSION,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CommandStatus,
  HarnessHookEvent,
  HookDecision,
  parseActionHookPayload,
  parseCommandEnvelope,
  type ActionHookPayload,
  type CanonicalHookDispatcherPort,
  type CommandEnvelope,
  type HookDispatchResult,
  type HookWorkspaceBinding,
  type PreActionHookPayload,
} from "#application/index.js";
import type { ActionJournalLocator } from "#application/ports/actionJournalRepository/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionJournalStatus,
  type ActionJournalState,
} from "#domain/actionJournal/index.js";
import { CodexHookAdapter } from "#infrastructure/executors/codex/hooks/index.js";

import {
  CODEX_CONTRACT_ALLOWED_TARGET,
  CODEX_CONTRACT_DENY_REASON,
  CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT,
} from "../constants/index.js";
import { CodexContractFaultInjection } from "../enums/index.js";

const CONTRACT_WORKSPACE_ROOT = "contract-workspace";
const CONTRACT_WORKSPACE_ID = "contract-workspace-v1";
const CONTRACT_TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CONTRACT_PLAN_RISK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FC0";
const CONTRACT_DIGEST = `sha256:${"1".repeat(64)}`;

interface CodexContractDispatchObservation {
  readonly command: CommandEnvelope;
  readonly payload: ActionHookPayload;
}

/** 为固定 Contract Case 组装窄读取端口与 Dispatcher double。 */
export class CodexContractRuntimeHarness {
  private readonly dispatcher: ContractDispatcher;
  private readonly bindingReader = new ContractHookBindingReader();
  private readonly taskReader = new ContractTaskReader();
  private readonly actionReader: ContractActionJournalReader;

  public constructor(faultInjection: CodexContractFaultInjection) {
    const registry = new ContractActionRegistry();
    this.dispatcher = new ContractDispatcher(registry, faultInjection);
    this.actionReader = new ContractActionJournalReader(registry);
  }

  /** 使用生产 CodexHookAdapter 创建当前隔离 Case 的执行入口。 */
  public createAdapter(
    adapterConstructor: typeof CodexHookAdapter,
    digest: ConstructorParameters<typeof CodexHookAdapter>[4],
    observationAnchor: string,
  ): CodexHookAdapter {
    if (adapterConstructor !== CodexHookAdapter) {
      throw new Error("Contract Suite 只允许运行生产 CodexHookAdapter。");
    }
    return new adapterConstructor(
      this.dispatcher,
      this.bindingReader,
      this.actionReader,
      this.taskReader,
      digest,
      new ContractObservationClock(observationAnchor),
    );
  }

  /** 返回 Dispatcher 实际接收的 Canonical Command。 */
  public commands(): readonly CommandEnvelope[] {
    return this.dispatcher.captured().map((item) => item.command);
  }

  /** 返回 Dispatcher 实际接收的 Canonical Payload。 */
  public payloads(): readonly ActionHookPayload[] {
    return this.dispatcher.captured().map((item) => item.payload);
  }
}

class ContractObservationClock {
  public constructor(private readonly observationAnchor: string) {}

  public now(): Date {
    return new Date(this.observationAnchor);
  }
}

class ContractHookBindingReader {
  public async find(cwd: string): Promise<Result<HookWorkspaceBinding, HarnessErrorType>> {
    if (cwd !== CONTRACT_WORKSPACE_ROOT) {
      return failure(
        new HarnessError(HarnessErrorCode.OperationForbidden, "Contract cwd 未绑定。"),
      );
    }
    return success({
      schemaVersion: "1.0.0",
      workspaceRoot: CONTRACT_WORKSPACE_ROOT,
      workspaceId: CONTRACT_WORKSPACE_ID,
      taskId: CONTRACT_TASK_ID,
      planRiskArtifactId: CONTRACT_PLAN_RISK_ID,
      planRiskArtifactDigest: CONTRACT_DIGEST,
      actorId: "contract-agent",
      boundAt: "2026-01-01T00:00:00.000Z",
    });
  }
}

class ContractTaskReader {
  public async load(): Promise<Result<void, HarnessErrorType>> {
    return success(undefined);
  }
}

class ContractActionJournalReader {
  public constructor(private readonly registry: ContractActionRegistry) {}

  public async load(
    locator: ActionJournalLocator,
  ): Promise<Result<ActionJournalState, HarnessErrorType>> {
    return this.registry.load(locator.actionId);
  }
}

class ContractActionRegistry {
  private readonly states = new Map<string, ActionJournalState>();

  public record(payload: PreActionHookPayload): void {
    this.states.set(payload.actionId, {
      intent: {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Intent,
        actionId: payload.actionId,
        sequence: 1,
        workspaceId: payload.workspaceId,
        taskId: payload.taskId,
        commandId: payload.commandId,
        correlationId: payload.correlationId,
        idempotencyKey: payload.idempotencyKey,
        kind: payload.actionKind,
        target: JSON.stringify(payload.targets),
        inputDigest: payload.inputDigest,
        postconditionDigest: payload.postconditionDigest,
        recoveryGuidance: payload.recoveryGuidance,
        actor: payload.actor,
        recordedAt: payload.occurredAt,
      },
      observations: [],
      resolutions: [],
      lastSequence: 1,
      status: ActionJournalStatus.IntentRecorded,
    });
  }

  public load(actionId: string): Result<ActionJournalState, HarnessErrorType> {
    const state = this.states.get(actionId);
    return state === undefined
      ? failure(new HarnessError(HarnessErrorCode.ActionNotFound, "Contract Action 不存在。"))
      : success(state);
  }
}

class ContractDispatcher implements CanonicalHookDispatcherPort {
  private readonly observations: CodexContractDispatchObservation[] = [];

  public constructor(
    private readonly registry: ContractActionRegistry,
    private readonly faultInjection: CodexContractFaultInjection,
  ) {}

  public async execute(input: unknown): Promise<Result<HookDispatchResult, HarnessErrorType>> {
    const command = parseCommandEnvelope(input);
    if (command.status === ResultStatus.Failure) return command;
    const payload = parseActionHookPayload(command.value.payload);
    if (payload.status === ResultStatus.Failure) return payload;
    this.observations.push({ command: command.value, payload: payload.value });

    const denied =
      payload.value.event === HarnessHookEvent.PreAction &&
      !payload.value.targets.every((target) => target === CODEX_CONTRACT_ALLOWED_TARGET);
    if (payload.value.event === HarnessHookEvent.PreAction && !denied) {
      this.registry.record(payload.value);
    }
    const reason = denied
      ? CODEX_CONTRACT_DENY_REASON
      : payload.value.event === HarnessHookEvent.PostAction
        ? this.faultInjection === CodexContractFaultInjection.PostAdditionalContext
          ? "已注入受控故障。"
          : CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT
        : "Contract PreAction 已允许。";
    return success({
      schemaVersion: CANONICAL_HOOK_SCHEMA_VERSION,
      event: payload.value.event,
      decision: denied ? HookDecision.Deny : HookDecision.Allow,
      reason,
      receipt: {
        schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
        commandId: command.value.commandId,
        status: CommandStatus.Committed,
        requestDigest: command.value.requestDigest,
        committedVersion: 1,
      },
    });
  }

  public captured(): readonly CodexContractDispatchObservation[] {
    return this.observations;
  }
}

/** 固定原生输入使用的非绝对工作目录。 */
export const codexContractRuntimeIdentity = {
  workspaceRoot: CONTRACT_WORKSPACE_ROOT,
} as const;
