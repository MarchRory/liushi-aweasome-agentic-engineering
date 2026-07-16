import { afterEach, describe, expect, it, vi } from "vitest";

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
