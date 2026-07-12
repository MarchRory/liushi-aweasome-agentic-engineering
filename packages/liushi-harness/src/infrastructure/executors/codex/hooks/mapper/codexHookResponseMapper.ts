import { HarnessHookEvent, HookDecision, type CodexHookResponse } from "#application/index.js";

import {
  CodexHookEvent,
  CodexPermissionDecision,
  CodexPostHookDecision,
} from "../constants/index.js";

/** 将 Canonical Hook 决策映射为 Codex 原生 JSON 响应。 */
export function mapCodexHookResponse(result: {
  event: HarnessHookEvent;
  decision: HookDecision;
  reason: string;
}): CodexHookResponse {
  if (result.event === HarnessHookEvent.PreAction) {
    return {
      body: {
        hookSpecificOutput: {
          hookEventName: CodexHookEvent.PreToolUse,
          permissionDecision:
            result.decision === HookDecision.Allow
              ? CodexPermissionDecision.Allow
              : CodexPermissionDecision.Deny,
          ...(result.decision === HookDecision.Allow
            ? {}
            : { permissionDecisionReason: result.reason }),
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
