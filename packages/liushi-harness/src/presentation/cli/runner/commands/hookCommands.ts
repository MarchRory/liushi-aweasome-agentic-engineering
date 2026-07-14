import {
  CODEX_HOOK_FAIL_CLOSED_REASON,
  CodexHookEvent,
  CodexPermissionDecision,
  CodexPostHookDecision,
  HookExecutorKind,
  type CodexHookResponse,
} from "#application/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";

import { CLI_EXIT_CODE_INVALID_INPUT, CLI_EXIT_CODE_SUCCESS } from "../../constants/index.js";
import {
  type CliApplication,
  type HookBindCliCommand,
  type HookConfigCliCommand,
  type HookHandleCliCommand,
  type HookProbeCliCommand,
  type RunCliDependencies,
} from "../../contracts/index.js";
import type { HookInputReader } from "../../input/index.js";
import { mapErrorExitCode, writeFailure, writeSuccess } from "../../output/index.js";

/** 执行 Human 显式确认后的 Hook 工作区绑定。 */
export async function executeHookBind(
  command: HookBindCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  const result = await application.bindHookWorkspace.execute({
    workspaceRoot: command.workspaceRoot,
    workspaceId: command.workspaceId,
    taskId: command.taskId,
    planRiskArtifactId: command.artifactId,
    planRiskArtifactDigest: command.artifactDigest,
    actorId: command.actorId,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 输出供 Human 审阅后写入的 Codex hooks.json 配置。 */
export function executeHookConfig(
  command: HookConfigCliCommand,
  dependencies: RunCliDependencies,
): number {
  if (command.executor !== HookExecutorKind.Codex) {
    return writeNativeHookFailure(
      dependencies,
      new HarnessError(HarnessErrorCode.InvalidInput, "Hook executor is not implemented."),
    );
  }
  if (dependencies.hookConfigProjector === undefined) {
    return writeNativeHookFailure(
      dependencies,
      new HarnessError(HarnessErrorCode.IoFailure, "Hook config projector is not configured."),
    );
  }
  dependencies.writer.stdout(`${JSON.stringify(dependencies.hookConfigProjector.project())}\n`);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 执行只读 Codex 能力探测，不修改项目或 Runtime Store。 */
export async function executeHookProbe(
  command: HookProbeCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  if (command.executor !== HookExecutorKind.Codex) {
    writeFailure(
      dependencies,
      command.outputFormat,
      command.command,
      new HarnessError(HarnessErrorCode.InvalidInput, "Hook executor is not implemented."),
    );
    return CLI_EXIT_CODE_INVALID_INPUT;
  }
  const result = await application.probeCodexCapabilities.execute({
    executable: command.executable,
  });
  if (result.status === ResultStatus.Failure) {
    writeFailure(dependencies, command.outputFormat, command.command, result.error);
    return mapErrorExitCode(result.error.code);
  }
  writeSuccess(dependencies, command.outputFormat, command.command, result.value);
  return CLI_EXIT_CODE_SUCCESS;
}

/** 处理 Coding Agent 通过 Stdin 传入的一次原生 Hook 调用。 */
export async function executeHookHandle(
  command: HookHandleCliCommand,
  application: CliApplication,
  dependencies: RunCliDependencies,
): Promise<number> {
  if (command.executor !== HookExecutorKind.Codex) {
    return writeNativeHookFailure(
      dependencies,
      new HarnessError(HarnessErrorCode.InvalidInput, "Hook executor is not implemented."),
    );
  }
  if (dependencies.hookInputReader === undefined) {
    return writeNativeHookFailure(
      dependencies,
      new HarnessError(HarnessErrorCode.IoFailure, "Hook input reader is not configured."),
    );
  }
  const input = await readCodexHookInput(dependencies.hookInputReader);
  if (input.status === ResultStatus.Failure) {
    return writeNativeHookFailure(dependencies, input.error);
  }
  const result = await handleCodexHook(application, input.value);
  if (result.status === ResultStatus.Failure) {
    return writeCodexHookFailClosed(dependencies, input.value, result.error);
  }
  if (result.value.body !== undefined) {
    dependencies.writer.stdout(`${JSON.stringify(result.value.body)}\n`);
  }
  return CLI_EXIT_CODE_SUCCESS;
}

async function readCodexHookInput(reader: HookInputReader): Promise<Result<unknown, HarnessError>> {
  try {
    return await reader.read();
  } catch {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Codex Hook input reader failed unexpectedly."),
    );
  }
}

async function handleCodexHook(
  application: CliApplication,
  input: unknown,
): Promise<Result<CodexHookResponse, HarnessError>> {
  try {
    return await application.handleCodexHook.execute(input);
  } catch {
    return failure(
      new HarnessError(HarnessErrorCode.IoFailure, "Codex Hook handler failed unexpectedly."),
    );
  }
}

function writeCodexHookFailClosed(
  dependencies: RunCliDependencies,
  input: unknown,
  error: HarnessError,
): number {
  const event = readCodexHookEvent(input);
  if (event === CodexHookEvent.PreToolUse) {
    return writeNativeHookBody(dependencies, {
      hookSpecificOutput: {
        hookEventName: CodexHookEvent.PreToolUse,
        permissionDecision: CodexPermissionDecision.Deny,
        permissionDecisionReason: CODEX_HOOK_FAIL_CLOSED_REASON,
      },
    });
  }
  if (event === CodexHookEvent.PostToolUse) {
    return writeNativeHookBody(dependencies, {
      decision: CodexPostHookDecision.Block,
      reason: CODEX_HOOK_FAIL_CLOSED_REASON,
    });
  }
  return writeNativeHookFailure(dependencies, error);
}

function readCodexHookEvent(input: unknown): CodexHookEvent | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const event = (input as Readonly<Record<string, unknown>>)["hook_event_name"];
  return Object.values(CodexHookEvent).includes(event as CodexHookEvent)
    ? (event as CodexHookEvent)
    : undefined;
}

function writeNativeHookBody(
  dependencies: RunCliDependencies,
  body: Readonly<Record<string, unknown>>,
): number {
  dependencies.writer.stdout(`${JSON.stringify(body)}\n`);
  return CLI_EXIT_CODE_SUCCESS;
}

function writeNativeHookFailure(dependencies: RunCliDependencies, error: HarnessError): number {
  dependencies.writer.stderr(`${error.message}\n`);
  return CLI_EXIT_CODE_INVALID_INPUT;
}
