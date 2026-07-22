import { ResultStatus, parseContentDigest, type ContentDigest } from "../../src/common/index.js";
import { describe, expect, it } from "vitest";
import {
  CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  createCodingTaskSessionActivationRecord,
  rebuildCodingTaskSessionActivationRecord,
  type CodingTaskSessionActivationRecordInput,
} from "../../src/domain/codingTaskSession/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/jsonDigest/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5FCX";

const invalidCases: Array<[string, Record<string, unknown>]> = [
  ["extra field", { extra: true }],
  ["invalid session ID", { sessionId: "../escape" }],
  ["invalid attempt", { attemptNumber: 0 }],
  ["invalid time", { activatedAt: "2026-07-23T00:00:01+08:00" }],
  ["empty actor", { agentActorId: "" }],
  ["empty worktree", { worktreeId: " " }],
];

function input(overrides: Partial<CodingTaskSessionActivationRecordInput> = {}) {
  return {
    schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
    sessionId,
    workspaceId: "workspace-1",
    codingTaskId: "coding-task-1",
    sourceTaskId,
    repositoryId: "repository-1",
    attemptNumber: 1,
    attemptStartedAt: "2026-07-23T00:00:00.000Z",
    worktreeId: "worktree-1",
    worktreeRootDigest: contentDigest("a"),
    planRiskArtifactId: "01ARZ3NDEKTSV4RRFFQ69G5FCY",
    planRiskArtifactDigest: contentDigest("b"),
    agentActorId: "agent:codex",
    activatedAt: "2026-07-23T00:00:01.000Z",
    ...overrides,
  };
}

function contentDigest(hexCharacter: string): ContentDigest {
  const parsed = parseContentDigest(`sha256:${hexCharacter.repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

describe("CodingTask Session Activation 领域记录", () => {
  it("创建并重建成功，且 Record 不可变", () => {
    const created = createCodingTaskSessionActivationRecord(input(), digest);
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Failure) return;
    expect(created.value.bindingDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(created.value)).toBe(true);

    const rebuilt = rebuildCodingTaskSessionActivationRecord(created.value, digest);
    expect(rebuilt.status).toBe(ResultStatus.Success);
    if (rebuilt.status === ResultStatus.Failure) return;
    expect(rebuilt.value).toEqual(created.value);
  });

  it.each(invalidCases)("拒绝 %s", (_name, overrides) => {
    const result = createCodingTaskSessionActivationRecord({ ...input(), ...overrides }, digest);
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("拒绝 bindingDigest 漂移", () => {
    const created = createCodingTaskSessionActivationRecord(input(), digest);
    if (created.status === ResultStatus.Failure) throw created.error;
    const result = rebuildCodingTaskSessionActivationRecord(
      { ...created.value, bindingDigest: contentDigest("c") },
      digest,
    );
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("拒绝重建输入中的 extra field", () => {
    const created = createCodingTaskSessionActivationRecord(input(), digest);
    if (created.status === ResultStatus.Failure) throw created.error;
    const result = rebuildCodingTaskSessionActivationRecord(
      { ...created.value, unexpected: "field" },
      digest,
    );
    expect(result.status).toBe(ResultStatus.Failure);
  });
});
