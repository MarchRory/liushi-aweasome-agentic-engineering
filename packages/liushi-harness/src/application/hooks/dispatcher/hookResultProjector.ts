import {
  CommandErrorCode,
  CommandStatus,
  type CommandReceipt,
} from "#application/command/index.js";
import { ActionJournalStatus, type ActionJournalState } from "#domain/actionJournal/index.js";

import { CANONICAL_HOOK_SCHEMA_VERSION } from "../constants/index.js";
import type { HookDispatchResult } from "../contracts/index.js";
import { HarnessHookEvent, HookDecision, HookFailureKind } from "../enums/index.js";

/** 依据 Action Journal 的权威状态投影成功或重放后的 Hook 决策。 */
export function projectActionStateDecision(
  event: HarnessHookEvent,
  receipt: CommandReceipt,
  state: ActionJournalState,
): HookDispatchResult {
  const decision = resolveStateDecision(event, state.status);
  return {
    schemaVersion: CANONICAL_HOOK_SCHEMA_VERSION,
    event,
    decision,
    reason: `Action Journal 当前状态为 ${state.status}。`,
    receipt,
    actionStatus: state.status,
    ...(decision === HookDecision.Deny ? { failureKind: HookFailureKind.AuthorizationDenied } : {}),
  };
}

/** 将 Gateway 的非成功 Receipt 投影为稳定、保守的 Hook 决策。 */
export function projectCommandReceiptDecision(
  event: HarnessHookEvent,
  receipt: CommandReceipt,
): HookDispatchResult {
  const failureKind = resolveReceiptFailureKind(receipt);
  return {
    schemaVersion: CANONICAL_HOOK_SCHEMA_VERSION,
    event,
    decision:
      receipt.status === CommandStatus.OutcomeUnknown ? HookDecision.Error : HookDecision.Deny,
    reason: receipt.errorMessage ?? `Hook Command 返回 ${receipt.status}。`,
    receipt,
    failureKind,
  };
}

function resolveStateDecision(event: HarnessHookEvent, status: ActionJournalStatus): HookDecision {
  if (event === HarnessHookEvent.PreAction) {
    return [ActionJournalStatus.IntentRecorded, ActionJournalStatus.RetryPermitted].includes(status)
      ? HookDecision.Allow
      : HookDecision.Deny;
  }
  if (status === ActionJournalStatus.RetryPermitted) return HookDecision.Continue;
  return [ActionJournalStatus.Committed, ActionJournalStatus.Recovered].includes(status)
    ? HookDecision.Allow
    : HookDecision.Deny;
}

function resolveReceiptFailureKind(receipt: CommandReceipt): HookFailureKind {
  if (receipt.status === CommandStatus.Conflict) return HookFailureKind.Conflict;
  if (receipt.status === CommandStatus.OutcomeUnknown) return HookFailureKind.OutcomeUnknown;
  return receipt.errorCode === CommandErrorCode.AuthorizationDenied
    ? HookFailureKind.AuthorizationDenied
    : HookFailureKind.Internal;
}
