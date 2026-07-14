import {
  CodexHookEvent,
  CodexPermissionDecision,
  CodexPostHookDecision,
  HarnessHookEvent,
  HookDecision,
  type CodexHookResponse,
} from "#application/index.js";

/** 将 Canonical Hook 决策映射为 Codex 原生 JSON 响应。 */
export function mapCodexHookResponse(result: {
  event: HarnessHookEvent;
  decision: HookDecision;
  reason: string;
}): CodexHookResponse {
  if (result.event === HarnessHookEvent.PreAction) {
    // 原样放行必须退出 0 且不输出；permissionDecision=allow 仅用于携带 updatedInput 的重写。
    if (result.decision === HookDecision.Allow) return {};
    return {
      body: {
        hookSpecificOutput: {
          hookEventName: CodexHookEvent.PreToolUse,
          permissionDecision: CodexPermissionDecision.Deny,
          permissionDecisionReason: result.reason,
        },
      },
    };
  }
  return result.decision === HookDecision.Allow
    ? {
        body: {
          hookSpecificOutput: {
            hookEventName: CodexHookEvent.PostToolUse,
            additionalContext: result.reason,
          },
        },
      }
    : { body: { decision: CodexPostHookDecision.Block, reason: result.reason } };
}
