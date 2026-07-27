import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { CodingTaskSessionCloseoutRecoveryRecoverCliCommand } from "../types/index.js";

/** 在调用领域服务前复验 CLI 与 Human Command 的公开身份绑定。 */
export function validateCodingTaskSessionCloseoutRecoveryCliBinding(
  command: CodingTaskSessionCloseoutRecoveryRecoverCliCommand,
  document: unknown,
): HarnessError | null {
  if (!isRecord(document)) return null;

  const actor = document["actor"];
  if (
    isRecord(actor) &&
    typeof actor["actorId"] === "string" &&
    actor["actorId"] !== command.actorId
  ) {
    return new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Human Command Actor 与 CLI Actor 不一致。",
    );
  }

  const payload = document["payload"];
  if (!isRecord(payload)) return null;
  if (
    typeof payload["workspaceId"] === "string" &&
    payload["workspaceId"] !== command.workspaceId
  ) {
    return new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Human Command Workspace 与 CLI Workspace 不一致。",
    );
  }
  if (typeof payload["sessionId"] === "string" && payload["sessionId"] !== command.sessionId) {
    return new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Human Command Session 与 CLI Session 不一致。",
    );
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
