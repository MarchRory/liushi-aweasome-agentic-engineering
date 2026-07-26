import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  rebuildCodingTaskSessionActionCoverageManifest,
  type CodingTaskSessionActionCoverageManifest,
} from "#application/codingTaskSessionActionCoverage/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";

import { calculateCloseoutCoverageBindingDigest } from "../digest/index.js";
import type {
  CodingTaskSessionCloseoutState,
  CodingTaskSessionCloseoutStateIdentity,
} from "../contracts/index.js";
import { parseDigest } from "./closeoutValidationSupport.js";

/** 严格重建并验证 Closeout 使用的 Coverage Manifest。 */
export function rebuildCloseoutCoverageManifest(
  input: unknown,
  digestPort: ContentDigestPort,
): Result<CodingTaskSessionActionCoverageManifest, HarnessError> {
  return rebuildCodingTaskSessionActionCoverageManifest(input, digestPort);
}

/** 验证 Coverage Manifest 与 Closeout、Snapshot 的固定身份和 Worktree 绑定。 */
export function validateCloseoutCoverageIdentity(
  state: CodingTaskSessionCloseoutStateIdentity,
  snapshot: CodingTaskSessionChangeSetSnapshot,
  manifest: CodingTaskSessionActionCoverageManifest,
): Result<void, HarnessError> {
  if (
    manifest.workspaceId !== state.workspaceId ||
    manifest.sessionId !== state.sessionId ||
    manifest.codingTaskId !== state.codingTaskId ||
    manifest.sourceTaskId !== state.sourceTaskId ||
    manifest.repositoryId !== state.repositoryId ||
    manifest.attemptNumber !== state.attemptNumber ||
    manifest.activationBindingDigest !== state.activationBindingDigest ||
    manifest.sessionBindingDigest !== state.sessionBindingDigest
  ) {
    return failure(coverageMismatch("Coverage Manifest 与 Closeout 身份不一致。"));
  }
  if (
    manifest.repositoryId !== snapshot.repositoryId ||
    manifest.worktreeId !== snapshot.worktreeId
  ) {
    return failure(
      coverageMismatch("Coverage Manifest 与 Snapshot 的 Repository 或 Worktree 不一致。"),
    );
  }
  return success(undefined);
}

/** 重算并验证 Snapshot、Manifest 与外层绑定摘要。 */
export function validateCloseoutCoverageBinding(
  state: CodingTaskSessionCloseoutState,
  digestPort: ContentDigestPort,
): Result<void, HarnessError> {
  const hasSnapshot = state.snapshot !== null;
  const hasManifest = state.coverageManifest !== null;
  const hasBinding = state.coverageBindingDigest !== null;
  if (hasSnapshot !== hasManifest || hasManifest !== hasBinding) {
    return failure(coverageInvariant("Snapshot、Coverage Manifest 与绑定摘要必须同时存在。"));
  }
  if (!hasSnapshot || !hasManifest || !hasBinding) return success(undefined);

  const identity = validateCloseoutCoverageIdentity(state, state.snapshot, state.coverageManifest);
  if (identity.status === ResultStatus.Failure) return identity;
  const parsedBinding = parseDigest(state.coverageBindingDigest, "coverageBindingDigest");
  if (parsedBinding.status === ResultStatus.Failure) return parsedBinding;
  const expectedBinding = calculateCloseoutCoverageBindingDigest(
    state.snapshot.snapshotDigest,
    state.coverageManifest.manifestDigest,
    digestPort,
  );
  if (expectedBinding.status === ResultStatus.Failure) return expectedBinding;
  return expectedBinding.value === parsedBinding.value
    ? success(undefined)
    : failure(coverageMismatch("Coverage Binding 摘要未绑定当前 Snapshot 与 Manifest。"));
}

function coverageMismatch(message: string): HarnessErrorType {
  return new HarnessError(HarnessErrorCode.PreconditionNotMet, message);
}

function coverageInvariant(message: string): HarnessErrorType {
  return new HarnessError(HarnessErrorCode.InvalidStateTransition, message, {
    field: "coverageManifest",
  });
}
