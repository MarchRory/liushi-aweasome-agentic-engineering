import { serializeAgentRunError } from "../processOutcome/index.mjs";

export const RUNTIME_CLEANUP_STATUS = Object.freeze({
  NotRequired: "not_required",
  Pending: "pending",
  Removed: "removed",
  Failed: "failed",
  PreservedUnknownProcess: "preserved_unknown_process",
});

export const RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS = Object.freeze({
  NotChecked: "not_checked",
  Verified: "verified",
  Failed: "failed",
  PreservedUnknownProcess: "preserved_unknown_process",
});

export function createAgentRuntimeAudit(packet) {
  return {
    planDigest: packet.runtimeIsolation.planDigest,
    root: packet.runtimeIsolation.plan.root,
    credentialStrategy: packet.runtimeIsolation.plan.credentialStrategy,
    environmentPolicyDigest: packet.runtimeIsolation.environmentPolicy.digest,
    prepared: false,
    credentialSourceIntegrity: {
      status: RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.NotChecked,
      checked: false,
      error: null,
    },
    cleanup: {
      status: RUNTIME_CLEANUP_STATUS.NotRequired,
      attempted: false,
      removed: false,
      preserved: false,
      error: null,
    },
  };
}

export function markAgentCredentialSourceVerified(audit) {
  return {
    ...audit,
    credentialSourceIntegrity: {
      status: RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.Verified,
      checked: true,
      error: null,
    },
  };
}

export function markAgentCredentialSourceFailed(audit, error) {
  return {
    ...audit,
    credentialSourceIntegrity: {
      status: RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.Failed,
      checked: true,
      error: serializeAgentRunError(error),
    },
  };
}

export function markAgentRuntimePrepared(audit) {
  return {
    ...audit,
    prepared: true,
    cleanup: {
      ...audit.cleanup,
      status: RUNTIME_CLEANUP_STATUS.Pending,
    },
  };
}

export function markAgentRuntimeRemoved(audit, removed) {
  return {
    ...audit,
    cleanup: {
      status: RUNTIME_CLEANUP_STATUS.Removed,
      attempted: true,
      removed: removed === true,
      preserved: false,
      error: null,
    },
  };
}

export function markAgentRuntimeCleanupFailed(audit, error) {
  return {
    ...audit,
    cleanup: {
      status: RUNTIME_CLEANUP_STATUS.Failed,
      attempted: true,
      removed: false,
      preserved: true,
      error: serializeAgentRunError(error),
    },
  };
}

export function markAgentRuntimePreserved(audit) {
  return {
    ...audit,
    credentialSourceIntegrity: {
      status: RUNTIME_CREDENTIAL_SOURCE_INTEGRITY_STATUS.PreservedUnknownProcess,
      checked: false,
      error: null,
    },
    cleanup: {
      status: RUNTIME_CLEANUP_STATUS.PreservedUnknownProcess,
      attempted: false,
      removed: false,
      preserved: true,
      error: null,
    },
  };
}
