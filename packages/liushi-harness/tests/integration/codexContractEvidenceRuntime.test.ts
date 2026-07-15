import { describe, expect, it } from "vitest";

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
      checkId: "post.additional_context_mapping.v1",
      outcome: CodexContractCheckOutcome.Failed,
    });
  });
});
