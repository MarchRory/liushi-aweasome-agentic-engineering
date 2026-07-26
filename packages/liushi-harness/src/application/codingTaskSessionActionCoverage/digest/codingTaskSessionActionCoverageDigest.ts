import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";

import type {
  CodingTaskSessionActionCoverageManifest,
  CodingTaskSessionActionCoverageManifestDigestInput,
} from "../contracts/index.js";

/** 构造 Coverage Proof manifest 的唯一摘要输入，排除最终 manifestDigest。 */
export function createCodingTaskSessionActionCoverageManifestDigestInput(
  manifest: CodingTaskSessionActionCoverageManifestDigestInput,
): CodingTaskSessionActionCoverageManifestDigestInput {
  return {
    schemaVersion: manifest.schemaVersion,
    workspaceId: manifest.workspaceId,
    sessionId: manifest.sessionId,
    codingTaskId: manifest.codingTaskId,
    sourceTaskId: manifest.sourceTaskId,
    repositoryId: manifest.repositoryId,
    attemptNumber: manifest.attemptNumber,
    activationBindingDigest: manifest.activationBindingDigest,
    sessionBindingDigest: manifest.sessionBindingDigest,
    worktreeId: manifest.worktreeId,
    worktreeRootDigest: manifest.worktreeRootDigest,
    executorSessionIdDigest: manifest.executorSessionIdDigest,
    actions: manifest.actions.map((action) => ({
      actionId: action.actionId,
      journalDigest: action.journalDigest,
      traceObservationDigests: [...action.traceObservationDigests],
    })),
  };
}

/** 使用既有 RFC 8785 Port 计算 canonical manifest 摘要。 */
export function calculateCodingTaskSessionActionCoverageManifestDigest(
  manifest: CodingTaskSessionActionCoverageManifestDigestInput,
  digestPort: ContentDigestPort,
): Result<ContentDigest, HarnessError> {
  return digestPort.calculate(createCodingTaskSessionActionCoverageManifestDigestInput(manifest));
}

/** 为 strict rebuild 提取不包含 manifestDigest 的内容。 */
export function withoutCodingTaskSessionActionCoverageManifestDigest(
  manifest: CodingTaskSessionActionCoverageManifest,
): CodingTaskSessionActionCoverageManifestDigestInput {
  return createCodingTaskSessionActionCoverageManifestDigestInput(manifest);
}
