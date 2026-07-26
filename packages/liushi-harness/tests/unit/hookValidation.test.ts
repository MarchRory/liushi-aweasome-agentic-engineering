import { describe, expect, it } from "vitest";

import {
  ActionOutcome,
  CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
  HarnessErrorCode,
  ResultStatus,
  parseActionHookPayload,
  parsePostActionHookPayload,
  parsePreActionHookPayload,
} from "../../src/index.js";
import { createPostActionHookInput, createPreActionHookInput } from "../support/hooks/index.js";

describe("Canonical Action Hook validation", () => {
  it("解析严格有效的 PreAction 与 PostAction", () => {
    expect(parsePreActionHookPayload(createPreActionHookInput()).status).toBe(ResultStatus.Success);
    expect(parsePostActionHookPayload(createPostActionHookInput()).status).toBe(
      ResultStatus.Success,
    );
  });

  it("要求 Session 1.1 Payload 携带不可省略的绑定上下文", () => {
    const sessionContext = {
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      sessionBindingDigest: `sha256:${"3".repeat(64)}`,
    };
    const pre = parsePreActionHookPayload(
      createPreActionHookInput({
        schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
        sessionContext,
      }),
    );
    const post = parsePostActionHookPayload(
      createPostActionHookInput({
        schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION,
        sessionContext,
      }),
    );
    const missing = parsePreActionHookPayload(
      createPreActionHookInput({ schemaVersion: CANONICAL_SESSION_HOOK_SCHEMA_VERSION }),
    );
    const legacySmuggling = parsePreActionHookPayload(createPreActionHookInput({ sessionContext }));

    expect(pre.status).toBe(ResultStatus.Success);
    expect(post.status).toBe(ResultStatus.Success);
    expect(missing.status).toBe(ResultStatus.Failure);
    expect(legacySmuggling.status).toBe(ResultStatus.Failure);
  });

  it.each([
    ["重复目标", ["packages/app/a.ts", "packages/app/a.ts"]],
    ["乱序目标", ["packages/app/z.ts", "packages/app/a.ts"]],
    ["父目录穿越", ["packages/app/../secret.ts"]],
    ["Windows 绝对路径", ["C:/workspace/file.ts"]],
    ["POSIX 绝对路径", ["/workspace/file.ts"]],
    ["反斜杠路径", ["packages\\app\\file.ts"]],
  ])("拒绝%s", (_caseName, targets) => {
    const result = parsePreActionHookPayload(createPreActionHookInput({ targets }));

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
  });

  it("拒绝没有 errorCode 的失败结果", () => {
    const result = parsePostActionHookPayload(
      createPostActionHookInput({ outcome: ActionOutcome.Failed, outputDigest: undefined }),
    );

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("拒绝结束时间早于开始时间和自指父 Span", () => {
    const invalidTime = parsePostActionHookPayload(
      createPostActionHookInput({ endedAt: "2026-07-12T07:00:00.000Z" }),
    );
    const selfParent = parsePostActionHookPayload(
      createPostActionHookInput({ parentSpanId: "0123456789abcdef" }),
    );

    expect(invalidTime.status).toBe(ResultStatus.Failure);
    expect(selfParent.status).toBe(ResultStatus.Failure);
  });

  it("对尚未实现的生命周期事件 fail closed", () => {
    const result = parseActionHookPayload({ event: "session_start" });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
  });
});
