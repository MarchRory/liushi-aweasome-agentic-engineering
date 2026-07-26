import type { HookBinding } from "#application/index.js";
import {
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  type ActionIntentRecord,
  type SessionActionIntentRecord,
} from "#domain/actionJournal/index.js";

/** 判断 Action Intent 是否与当前 Hook Binding 版本及 Session 身份完全一致。 */
export function isCodexIntentCompatibleWithBinding(
  intent: ActionIntentRecord,
  binding: HookBinding,
): boolean {
  const isSessionBinding = binding.schemaVersion === "2.0.0";
  const isSessionIntent = intent.schemaVersion === SESSION_ACTION_JOURNAL_SCHEMA_VERSION;
  if (isSessionBinding !== isSessionIntent) return false;
  if (!isSessionBinding) return true;
  const provenance = (intent as SessionActionIntentRecord).sessionProvenance;
  return (
    provenance.sessionId === binding.sessionId &&
    provenance.codingTaskId === binding.codingTaskId &&
    provenance.attemptNumber === binding.attemptNumber &&
    provenance.worktreeId === binding.worktreeId &&
    provenance.worktreeRootDigest === binding.worktreeRootDigest &&
    provenance.activationBindingDigest === binding.activationBindingDigest &&
    provenance.sessionBindingDigest === binding.sessionBindingDigest
  );
}
