import {
  CodexHookEvent,
  type CodexHookHandler,
  type CodexHookResponse,
} from "#application/index.js";
import { HarnessErrorCode, ResultStatus, type HarnessError, type Result } from "#common/index.js";
import { CodexPermissionMode } from "#infrastructure/executors/codex/hooks/index.js";
import { NodeHookInputReaderAdapter } from "#infrastructure/hookInputReader/index.js";

import { CODEX_CONTRACT_ALLOWED_TARGET } from "../constants/index.js";
import { codexContractRuntimeIdentity } from "./codexContractRuntime.doubles.js";

/** 覆盖生产 Reader 的分块读取以及 Adapter 对合法与非法原生输入的关闭式处理。 */
export async function runCodexContractNativeInputChecks(
  adapter: CodexHookHandler,
): Promise<readonly boolean[]> {
  const readerConstructor = NodeHookInputReaderAdapter;
  const pre = await executeNativeInput(
    adapter,
    serializeCodexContractInput(
      createCodexContractPreInput("contract-native-v2", CODEX_CONTRACT_ALLOWED_TARGET),
    ),
    readerConstructor,
  );
  const post = await executeNativeInput(
    adapter,
    serializeCodexContractInput(
      createCodexContractPostInput("contract-native-v2", CODEX_CONTRACT_ALLOWED_TARGET),
    ),
    readerConstructor,
  );
  const invalidJson = await executeNativeInput(adapter, ['{"hook_event_name":'], readerConstructor);
  const empty = await executeNativeInput(adapter, [], readerConstructor);
  const invalidStructure = await executeNativeInput(
    adapter,
    serializeCodexContractInput({ hook_event_name: CodexHookEvent.PreToolUse }),
    readerConstructor,
  );
  return [
    pre.read.status === ResultStatus.Success,
    pre.execution?.status === ResultStatus.Success,
    post.read.status === ResultStatus.Success && post.execution?.status === ResultStatus.Success,
    isReaderFailure(invalidJson),
    isReaderFailure(empty),
    invalidStructure.read.status === ResultStatus.Success &&
      invalidStructure.execution?.status === ResultStatus.Failure &&
      invalidStructure.execution.error.code === HarnessErrorCode.InvalidInput,
  ];
}

async function executeNativeInput(
  adapter: CodexHookHandler,
  chunks: readonly unknown[],
  readerConstructor: typeof NodeHookInputReaderAdapter,
): Promise<{
  readonly read: Result<unknown, HarnessError>;
  readonly execution?: Result<CodexHookResponse, HarnessError>;
}> {
  if (readerConstructor !== NodeHookInputReaderAdapter) {
    throw new Error("Contract Suite 只允许运行生产 NodeHookInputReaderAdapter。");
  }
  const read = await new readerConstructor(createChunkSource(chunks)).read();
  if (read.status === ResultStatus.Failure) return { read };
  return { read, execution: await adapter.execute(read.value) };
}

function isReaderFailure(input: {
  readonly read: Result<unknown, HarnessError>;
  readonly execution?: Result<CodexHookResponse, HarnessError>;
}): boolean {
  return (
    input.read.status === ResultStatus.Failure &&
    input.read.error.code === HarnessErrorCode.InvalidInput &&
    input.execution === undefined
  );
}

/** 把固定原生输入序列化为三个稳定分块，避免绕过生产 Reader。 */
export function serializeCodexContractInput(input: unknown): readonly string[] {
  const serialized = JSON.stringify(input);
  const secondBoundary = Math.max(2, Math.floor(serialized.length / 2));
  return [
    serialized.slice(0, 1),
    serialized.slice(1, secondBoundary),
    serialized.slice(secondBoundary),
  ];
}

/** 创建固定 Contract PreToolUse 原生输入。 */
export function createCodexContractPreInput(
  toolUseId: string,
  target: string,
): Readonly<Record<string, unknown>> {
  return createNativeInput(CodexHookEvent.PreToolUse, toolUseId, target);
}

/** 创建固定 Contract PostToolUse 原生输入。 */
export function createCodexContractPostInput(
  toolUseId: string,
  target: string,
): Readonly<Record<string, unknown>> {
  return {
    ...createNativeInput(CodexHookEvent.PostToolUse, toolUseId, target),
    tool_response: { success: true },
  };
}

function createNativeInput(
  event: CodexHookEvent,
  toolUseId: string,
  target: string,
): Readonly<Record<string, unknown>> {
  return {
    session_id: "contract-session-v2",
    cwd: codexContractRuntimeIdentity.workspaceRoot,
    hook_event_name: event,
    model: "contract-model-v2",
    permission_mode: CodexPermissionMode.Default,
    turn_id: "contract-turn-v2",
    transcript_path: null,
    tool_name: "apply_patch",
    tool_use_id: toolUseId,
    tool_input: {
      command: `*** Begin Patch\n*** Update File: ${target}\n@@\n*** End Patch`,
    },
  };
}

function createChunkSource(chunks: readonly unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const chunk of chunks) yield chunk;
    },
  };
}
