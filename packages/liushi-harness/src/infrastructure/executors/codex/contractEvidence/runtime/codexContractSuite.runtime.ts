import {
  CodexPermissionDecision,
  HarnessHookEvent,
  type ActionHookPayload,
  type CodexHookResponse,
} from "#application/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import { ResultStatus, type HarnessError, type Result } from "#common/index.js";
import { ActionKind } from "#domain/actionJournal/index.js";
import { ExecutorEvidenceOutcome } from "#domain/executorCompatibility/index.js";
import type * as CodexHooks from "#infrastructure/executors/codex/hooks/index.js";

import {
  CODEX_CONTRACT_ALLOWED_TARGET,
  CODEX_CONTRACT_DENIED_TARGET,
  CODEX_CONTRACT_DENY_REASON,
  CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT,
  CODEX_CONTRACT_SUITE_DEFINITION,
} from "../constants/index.js";
import type {
  CodexContractCaseDefinition,
  CodexContractCaseResult,
  CodexContractCheckResult,
} from "../contracts/index.js";
import { CodexContractCheckOutcome, CodexContractFaultInjection } from "../enums/index.js";
import { CodexContractRuntimeHarness } from "./codexContractRuntime.doubles.js";
import {
  createCodexContractPostInput,
  createCodexContractPreInput,
  runCodexContractNativeInputChecks,
} from "./codexContractNativeInput.runtime.js";

/** 通过生产 CodexHookAdapter 运行固定且不可扩展命令的 Contract Suite。 */
export async function runCodexContractSuite(
  digest: ContentDigestPort,
  observationAnchor: string,
  adapterConstructor: typeof CodexHooks.CodexHookAdapter,
  faultInjection: CodexContractFaultInjection,
): Promise<readonly CodexContractCaseResult[]> {
  const definitions = CODEX_CONTRACT_SUITE_DEFINITION.cases;
  return Promise.all([
    runCommandHookHandlerCase(
      requireDefinition(definitions, 0),
      digest,
      observationAnchor,
      adapterConstructor,
    ),
    runNativeHookInputCase(
      requireDefinition(definitions, 1),
      digest,
      observationAnchor,
      adapterConstructor,
    ),
    runPreFileMutationCase(
      requireDefinition(definitions, 2),
      digest,
      observationAnchor,
      adapterConstructor,
    ),
    runPostFileMutationCase(
      requireDefinition(definitions, 3),
      digest,
      observationAnchor,
      adapterConstructor,
      faultInjection,
    ),
    runDenyFileMutationCase(
      requireDefinition(definitions, 4),
      digest,
      observationAnchor,
      adapterConstructor,
    ),
  ]);
}

async function runCommandHookHandlerCase(
  definition: CodexContractCaseDefinition,
  digest: ContentDigestPort,
  observationAnchor: string,
  adapterConstructor: typeof CodexHooks.CodexHookAdapter,
): Promise<CodexContractCaseResult> {
  const primaryHarness = new CodexContractRuntimeHarness(CodexContractFaultInjection.None);
  const replayHarness = new CodexContractRuntimeHarness(CodexContractFaultInjection.None);
  const input = createCodexContractPreInput("contract-command-v2", CODEX_CONTRACT_ALLOWED_TARGET);
  const [result, replayResult] = await Promise.all([
    primaryHarness.createAdapter(adapterConstructor, digest, observationAnchor).execute(input),
    replayHarness.createAdapter(adapterConstructor, digest, observationAnchor).execute(input),
  ]);
  const primaryDispatch = primaryHarness.dispatches()[0];
  const replayDispatch = replayHarness.dispatches()[0];
  const command = primaryDispatch?.command;
  const payload = primaryDispatch?.payload;
  return createCaseResult(definition, [
    result.status === ResultStatus.Success && replayResult.status === ResultStatus.Success,
    command?.commandType === "hook.pre_action" &&
      command.aggregateType === "action" &&
      command.expectedVersion === 0 &&
      command.invocationProvenance?.executor === "codex",
    isCanonicalFileMutationPayload(payload, HarnessHookEvent.PreAction),
    hasSameDispatchDigest(primaryDispatch, replayDispatch, digest),
  ]);
}

async function runNativeHookInputCase(
  definition: CodexContractCaseDefinition,
  digest: ContentDigestPort,
  observationAnchor: string,
  adapterConstructor: typeof CodexHooks.CodexHookAdapter,
): Promise<CodexContractCaseResult> {
  const harness = new CodexContractRuntimeHarness(CodexContractFaultInjection.None);
  const adapter = harness.createAdapter(adapterConstructor, digest, observationAnchor);
  return createCaseResult(definition, await runCodexContractNativeInputChecks(adapter));
}

async function runPreFileMutationCase(
  definition: CodexContractCaseDefinition,
  digest: ContentDigestPort,
  observationAnchor: string,
  adapterConstructor: typeof CodexHooks.CodexHookAdapter,
): Promise<CodexContractCaseResult> {
  const harness = new CodexContractRuntimeHarness(CodexContractFaultInjection.None);
  const result = await harness
    .createAdapter(adapterConstructor, digest, observationAnchor)
    .execute(createCodexContractPreInput("contract-pre-v2", CODEX_CONTRACT_ALLOWED_TARGET));
  const command = harness.commands()[0];
  const payload = harness.payloads()[0];
  return createCaseResult(definition, [
    result.status === ResultStatus.Success,
    command?.commandType === "hook.pre_action" &&
      isCanonicalFileMutationPayload(payload, HarnessHookEvent.PreAction),
    result.status === ResultStatus.Success && result.value.body === undefined,
  ]);
}

async function runPostFileMutationCase(
  definition: CodexContractCaseDefinition,
  digest: ContentDigestPort,
  observationAnchor: string,
  adapterConstructor: typeof CodexHooks.CodexHookAdapter,
  faultInjection: CodexContractFaultInjection,
): Promise<CodexContractCaseResult> {
  const harness = new CodexContractRuntimeHarness(faultInjection);
  const adapter = harness.createAdapter(adapterConstructor, digest, observationAnchor);
  await adapter.execute(
    createCodexContractPreInput("contract-post-v2", CODEX_CONTRACT_ALLOWED_TARGET),
  );
  const result = await adapter.execute(
    createCodexContractPostInput("contract-post-v2", CODEX_CONTRACT_ALLOWED_TARGET),
  );
  const command = harness.commands()[1];
  const payload = harness.payloads()[1];
  return createCaseResult(definition, [
    result.status === ResultStatus.Success,
    command?.commandType === "hook.post_action" &&
      isCanonicalFileMutationPayload(payload, HarnessHookEvent.PostAction),
    hasHookSpecificValue(result, "additionalContext", CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT),
  ]);
}

async function runDenyFileMutationCase(
  definition: CodexContractCaseDefinition,
  digest: ContentDigestPort,
  observationAnchor: string,
  adapterConstructor: typeof CodexHooks.CodexHookAdapter,
): Promise<CodexContractCaseResult> {
  const harness = new CodexContractRuntimeHarness(CodexContractFaultInjection.None);
  const result = await harness
    .createAdapter(adapterConstructor, digest, observationAnchor)
    .execute(createCodexContractPreInput("contract-deny-v2", CODEX_CONTRACT_DENIED_TARGET));
  const payload = harness.payloads()[0];
  return createCaseResult(definition, [
    payload?.event === HarnessHookEvent.PreAction &&
      payload.targets.length === 1 &&
      payload.targets[0] === CODEX_CONTRACT_DENIED_TARGET,
    hasHookSpecificValue(result, "permissionDecision", CodexPermissionDecision.Deny) &&
      hasHookSpecificValue(result, "permissionDecisionReason", CODEX_CONTRACT_DENY_REASON),
  ]);
}

function createCaseResult(
  definition: CodexContractCaseDefinition,
  assertions: readonly boolean[],
): CodexContractCaseResult {
  const checks: readonly CodexContractCheckResult[] = definition.checkIds.map((checkId, index) => ({
    checkId,
    outcome:
      assertions[index] === true
        ? CodexContractCheckOutcome.Passed
        : CodexContractCheckOutcome.Failed,
  }));
  return {
    caseId: definition.caseId,
    capability: definition.capability,
    outcome: checks.every((check) => check.outcome === CodexContractCheckOutcome.Passed)
      ? ExecutorEvidenceOutcome.Passed
      : ExecutorEvidenceOutcome.Failed,
    checks,
  };
}

function isCanonicalFileMutationPayload(
  payload: ActionHookPayload | undefined,
  event: HarnessHookEvent,
): boolean {
  if (payload?.event !== event) return false;
  if (payload.event === HarnessHookEvent.PreAction) {
    return (
      payload.actionKind === ActionKind.FileMutation &&
      payload.targets.length === 1 &&
      payload.targets[0] === CODEX_CONTRACT_ALLOWED_TARGET
    );
  }
  return payload.event === HarnessHookEvent.PostAction && payload.toolName === "apply_patch";
}

function hasHookSpecificValue(
  result: Result<CodexHookResponse, HarnessError>,
  key: string,
  expected: string,
): boolean {
  if (result.status === ResultStatus.Failure || !isRecord(result.value.body)) return false;
  const specific = result.value.body["hookSpecificOutput"];
  return isRecord(specific) && specific[key] === expected;
}

function hasSameDispatchDigest(
  primary: unknown,
  replay: unknown,
  digest: ContentDigestPort,
): boolean {
  if (primary === undefined || replay === undefined) return false;
  const primaryDigest = digest.calculate(primary);
  if (primaryDigest.status === ResultStatus.Failure) return false;
  const replayDigest = digest.calculate(replay);
  return replayDigest.status === ResultStatus.Success && replayDigest.value === primaryDigest.value;
}

function requireDefinition(
  definitions: readonly CodexContractCaseDefinition[],
  index: number,
): CodexContractCaseDefinition {
  const definition = definitions[index];
  if (definition === undefined) throw new Error("固定 Contract Suite 定义不完整。");
  return definition;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
