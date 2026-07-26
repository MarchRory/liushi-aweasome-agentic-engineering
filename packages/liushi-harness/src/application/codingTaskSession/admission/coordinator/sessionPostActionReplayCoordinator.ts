import type { SessionPostActionHookPayload } from "#application/hooks/index.js";
import type { SessionActionHookHandlerSuccess } from "#application/hooks/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import type { ActionJournalState } from "#domain/actionJournal/index.js";

import { validateSessionPostActionReplay } from "../validation/index.js";

/** 对已闭合 PostAction 执行零副作用重放复验；活动 Journal 返回 null。 */
export function replayCompletedSessionPostAction(
  payload: SessionPostActionHookPayload,
  state: ActionJournalState,
  digest: ContentDigestPort,
): Result<SessionActionHookHandlerSuccess, HarnessError> | null {
  const replay = validateSessionPostActionReplay(payload, state, digest);
  if (replay.status === ResultStatus.Failure) return replay;
  return replay.value ? success({ committedVersion: state.lastSequence }) : null;
}
