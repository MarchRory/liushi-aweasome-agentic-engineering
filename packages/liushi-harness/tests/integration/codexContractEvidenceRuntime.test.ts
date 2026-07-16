import { afterEach, describe, expect, it, vi } from "vitest";

import { HarnessErrorCode } from "../../src/common/index.js";
import {
  ExecutorCapability,
  ExecutorEvidenceOutcome,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CODEX_CONTRACT_SUITE_DEFINITION,
  CodexContractCheckOutcome,
  CodexContractFaultInjection,
  runCodexContractSuite,
} from "../../src/infrastructure/executors/codex/contractEvidence/index.js";
import { CodexHookAdapter } from "../../src/infrastructure/executors/codex/hooks/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/jsonDigest/index.js";
import { DispatchSequenceDigestDouble } from "../support/codexContractEvidence/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const OBSERVATION_ANCHOR = "2026-07-16T08:00:00.000Z";

describe("Codex Contract Suite Runtime", () => {
  afterEach(() => vi.restoreAllMocks());

  it("通过生产 CodexHookAdapter 完成固定五个 Case", async () => {
    const results = await runCodexContractSuite(
      digest,
      OBSERVATION_ANCHOR,
      CodexHookAdapter,
      CodexContractFaultInjection.None,
    );

    expect(results).toHaveLength(5);
    expect(results.map((item) => item.caseId)).toEqual(
      CODEX_CONTRACT_SUITE_DEFINITION.cases.map((item) => item.caseId),
    );
    expect(results.every((item) => item.outcome === ExecutorEvidenceOutcome.Passed)).toBe(true);
    expect(
      results
        .flatMap((item) => item.checks)
        .every((check) => check.outcome === CodexContractCheckOutcome.Passed),
    ).toBe(true);
    expect(
      results.find((item) => item.capability === ExecutorCapability.CommandHookHandler)?.checks,
    ).toContainEqual({
      checkId: "command.deterministic_replay.v2",
      outcome: CodexContractCheckOutcome.Passed,
    });
    expect(
      results
        .find((item) => item.capability === ExecutorCapability.NativeHookInput)
        ?.checks.map((check) => check.checkId),
    ).toEqual([
      "native.chunked_json_stdin.v2",
      "native.pre_input_accepted.v2",
      "native.post_input_accepted.v2",
      "native.invalid_json_fail_closed.v2",
      "native.empty_input_fail_closed.v2",
      "native.invalid_structure_fail_closed.v2",
    ]);
  });

  it("确定性重放向两个 Adapter 提供独立输入且单侧修改不会污染另一侧", async () => {
    const mutationMarker = Symbol("primary-replay-input-mutation");
    const commandInputs: unknown[] = [];
    let replaySawMutation = false;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 测试会以实际 Adapter 实例显式调用原型方法。
    const execute = CodexHookAdapter.prototype.execute;
    vi.spyOn(CodexHookAdapter.prototype, "execute").mockImplementation(function (
      this: CodexHookAdapter,
      input: unknown,
    ) {
      if (isCommandReplayInput(input)) {
        commandInputs.push(input);
        if (commandInputs.length === 1) {
          Reflect.set(input, mutationMarker, true);
        } else {
          replaySawMutation = Reflect.get(input, mutationMarker) === true;
        }
      }
      return execute.call(this, input);
    });

    const results = await runCodexContractSuite(
      digest,
      OBSERVATION_ANCHOR,
      CodexHookAdapter,
      CodexContractFaultInjection.None,
    );

    expect(commandInputs).toHaveLength(2);
    expect(commandInputs[0]).not.toBe(commandInputs[1]);
    expect(replaySawMutation).toBe(false);
    expect(findDeterministicReplayCheck(results)?.outcome).toBe(CodexContractCheckOutcome.Passed);
  });

  it("任一隔离 Harness 产生额外 Dispatch 时确定性重放 Check Failed", async () => {
    let commandExecutionCount = 0;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 测试会以实际 Adapter 实例显式调用原型方法。
    const execute = CodexHookAdapter.prototype.execute;
    vi.spyOn(CodexHookAdapter.prototype, "execute").mockImplementation(async function (
      this: CodexHookAdapter,
      input: unknown,
    ) {
      const addExtraDispatch = isCommandReplayInput(input) && commandExecutionCount++ === 0;
      const result = await execute.call(this, input);
      if (addExtraDispatch) await execute.call(this, input);
      return result;
    });

    const results = await runCodexContractSuite(
      digest,
      OBSERVATION_ANCHOR,
      CodexHookAdapter,
      CodexContractFaultInjection.None,
    );
    const commandCase = results.find(
      (item) => item.capability === ExecutorCapability.CommandHookHandler,
    );

    expect(commandCase?.outcome).toBe(ExecutorEvidenceOutcome.Failed);
    expect(
      commandCase?.checks.filter((check) => check.outcome === CodexContractCheckOutcome.Failed),
    ).toEqual([
      {
        checkId: "command.deterministic_replay.v2",
        outcome: CodexContractCheckOutcome.Failed,
      },
    ]);
  });

  it("完整 Dispatch 序列后续项不同时确定性重放 Check Failed", async () => {
    const sequenceDigest = new DispatchSequenceDigestDouble(digest);
    const commandAdapters = new Map<CodexHookAdapter, number>();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 测试会以实际 Adapter 实例显式调用原型方法。
    const execute = CodexHookAdapter.prototype.execute;
    vi.spyOn(CodexHookAdapter.prototype, "execute").mockImplementation(async function (
      this: CodexHookAdapter,
      input: unknown,
    ) {
      if (!isCommandReplayInput(input)) return execute.call(this, input);
      const adapterIndex = commandAdapters.get(this) ?? commandAdapters.size;
      commandAdapters.set(this, adapterIndex);
      const result = await execute.call(this, input);
      await execute.call(this, {
        ...input,
        tool_use_id: `contract-command-extra-${String(adapterIndex)}-v2`,
      });
      return result;
    });

    const results = await runCodexContractSuite(
      sequenceDigest,
      OBSERVATION_ANCHOR,
      CodexHookAdapter,
      CodexContractFaultInjection.None,
    );

    expect(findDeterministicReplayCheck(results)?.outcome).toBe(CodexContractCheckOutcome.Failed);
    expect(sequenceDigest.dispatchSequences).toHaveLength(2);
    expect(sequenceDigest.dispatchSequences[0]).toHaveLength(2);
    expect(sequenceDigest.dispatchSequences[1]).toHaveLength(2);
    expect(sequenceDigest.dispatchSequences[0]?.[0]).toEqual(
      sequenceDigest.dispatchSequences[1]?.[0],
    );
    expect(sequenceDigest.dispatchSequences[0]?.[1]).not.toEqual(
      sequenceDigest.dispatchSequences[1]?.[1],
    );
  });

  it("Replay 侧完整 Dispatch 序列摘要失败时 Suite 直接 reject", async () => {
    const failingDigest = new DispatchSequenceDigestDouble(digest, 2);

    await expect(
      runCodexContractSuite(
        failingDigest,
        OBSERVATION_ANCHOR,
        CodexHookAdapter,
        CodexContractFaultInjection.None,
      ),
    ).rejects.toMatchObject({ code: HarnessErrorCode.IoFailure });
    expect(failingDigest.dispatchSequences).toHaveLength(2);
  });

  it("Post additionalContext 故障仅机械聚合 Post Case 为 Failed", async () => {
    const results = await runCodexContractSuite(
      digest,
      OBSERVATION_ANCHOR,
      CodexHookAdapter,
      CodexContractFaultInjection.PostAdditionalContext,
    );
    const failed = results.filter((item) => item.outcome === ExecutorEvidenceOutcome.Failed);
    const post = results.find((item) => item.capability === ExecutorCapability.PostFileMutation);

    expect(failed).toHaveLength(1);
    expect(failed[0]?.capability).toBe(ExecutorCapability.PostFileMutation);
    expect(post?.checks).toContainEqual({
      checkId: "post.additional_context_mapping.v2",
      outcome: CodexContractCheckOutcome.Failed,
    });
  });

  it.each([
    [
      "结构不完整输入",
      (input: unknown) =>
        isRecord(input) && input["hook_event_name"] === "PreToolUse" && !("session_id" in input),
    ],
    [
      "合法输入",
      (input: unknown) => isRecord(input) && input["tool_use_id"] === "contract-command-v2",
    ],
  ] as const)("%s触发 Adapter 异常时 Suite 直接 reject", async (label, shouldThrow) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 测试会以实际 Adapter 实例显式调用原型方法。
    const execute = CodexHookAdapter.prototype.execute;
    vi.spyOn(CodexHookAdapter.prototype, "execute").mockImplementation(function (
      this: CodexHookAdapter,
      input: unknown,
    ) {
      if (shouldThrow(input)) return Promise.reject(new Error(`${label}异常`));
      return execute.call(this, input);
    });

    await expect(
      runCodexContractSuite(
        digest,
        OBSERVATION_ANCHOR,
        CodexHookAdapter,
        CodexContractFaultInjection.None,
      ),
    ).rejects.toThrow(`${label}异常`);
  });
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCommandReplayInput(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && value["tool_use_id"] === "contract-command-v2";
}

function findDeterministicReplayCheck(results: Awaited<ReturnType<typeof runCodexContractSuite>>) {
  return results
    .find((item) => item.capability === ExecutorCapability.CommandHookHandler)
    ?.checks.find((check) => check.checkId === "command.deterministic_replay.v2");
}
