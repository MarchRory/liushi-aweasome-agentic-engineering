import { CodexHookEvent } from "#application/index.js";

import {
  CODEX_HOOK_DEFAULT_COMMAND,
  CODEX_HOOK_DEFAULT_MATCHER,
  CODEX_HOOK_POST_STATUS_MESSAGE,
  CODEX_HOOK_PRE_STATUS_MESSAGE,
} from "./constants/index.js";
import {
  CodexHookHandlerType,
  type CodexHookCommandHandler,
  type CodexHookMatcherGroup,
  type CodexHookProjection,
  type CodexHookProjectionOptions,
} from "./contracts/index.js";

/** 构造不包含 prompt/agent/async 的确定性 Codex command Hook 配置。 */
export function createCodexHookProjection(
  options: CodexHookProjectionOptions = {},
): CodexHookProjection {
  const command = options.command ?? CODEX_HOOK_DEFAULT_COMMAND;
  const commandWindows = options.commandWindows ?? command;
  const matcher = options.matcher ?? CODEX_HOOK_DEFAULT_MATCHER;
  const preStatusMessage = options.preStatusMessage ?? CODEX_HOOK_PRE_STATUS_MESSAGE;
  const postStatusMessage = options.postStatusMessage ?? CODEX_HOOK_POST_STATUS_MESSAGE;

  return {
    hooks: {
      [CodexHookEvent.PreToolUse]: [
        createMatcherGroup(matcher, createHandler(command, commandWindows, preStatusMessage)),
      ],
      [CodexHookEvent.PostToolUse]: [
        createMatcherGroup(matcher, createHandler(command, commandWindows, postStatusMessage)),
      ],
    },
  };
}

function createMatcherGroup(
  matcher: string,
  handler: CodexHookCommandHandler,
): CodexHookMatcherGroup {
  return { matcher, hooks: [handler] };
}

function createHandler(
  command: string,
  commandWindows: string,
  statusMessage: string,
): CodexHookCommandHandler {
  return {
    type: CodexHookHandlerType.Command,
    command,
    commandWindows,
    statusMessage,
  };
}
