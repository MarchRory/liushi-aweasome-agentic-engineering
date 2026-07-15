import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus, type ContentDigest } from "#common/index.js";
import {
  ExecutorEvidenceLocatorKind,
  createExecutorCapabilityEvidenceDigestInput,
  type ExecutorCapabilityEvidence,
  type ExecutorCompatibilityDigestPort,
} from "#domain/executorCompatibility/index.js";

import type { ValidatedExecutorCompatibilityEvidenceProjection } from "../contracts/index.js";
import {
  isSafeRuntimeStoreLocator,
  parseExecutorCompatibilityContentDigest,
} from "../path/index.js";
import { parseExecutorCompatibilityArtifact } from "../schema/index.js";
import { parseExecutorCompatibilityEvidence } from "../schema/index.js";

/** 在任何 I/O 前完整校验受信 Projection 的摘要与来源绑定。 */
export function validateExecutorCompatibilityEvidenceProjection(
  projection: ExecutorCompatibilityEvidenceProjection,
  digestPort: ExecutorCompatibilityDigestPort,
): ValidatedExecutorCompatibilityEvidenceProjection {
  const artifactDigest = parseExecutorCompatibilityContentDigest(projection.artifactDigest);
  const artifact = parseExecutorCompatibilityArtifact(projection.artifact);
  assertDigestMatches(
    digestPort,
    artifact,
    artifactDigest,
    "Executor Compatibility Artifact 摘要不匹配。",
    HarnessErrorCode.InvalidInput,
  );
  if (!Array.isArray(projection.evidence) || projection.evidence.length === 0) {
    throw invalidInput("Executor Compatibility Projection 必须包含 Evidence。", "evidence");
  }

  let locatorValue: string | undefined;
  const evidence = projection.evidence.map((value) => {
    const item = parseExecutorCompatibilityEvidence(value, HarnessErrorCode.InvalidInput);
    const evidenceDigest = parseExecutorCompatibilityContentDigest(item.evidenceDigest);
    if (item.source.artifactDigest !== artifactDigest) {
      throw invalidInput(
        "全部 Evidence 必须引用 Projection 的 Artifact 摘要。",
        "source.artifactDigest",
      );
    }
    if (
      item.source.locator.kind !== ExecutorEvidenceLocatorKind.RuntimeStore ||
      !isSafeRuntimeStoreLocator(item.source.locator.value)
    ) {
      throw invalidInput("Evidence 必须使用安全的 Runtime Store Locator。", "source.locator");
    }
    if (!matchesContentAddressedArtifactLocator(item)) {
      throw invalidInput(
        "Evidence Runtime Store Locator 必须精确绑定 Adapter 与 Artifact 摘要。",
        "source.locator.value",
      );
    }
    if (locatorValue !== undefined && locatorValue !== item.source.locator.value) {
      throw invalidInput("全部 Evidence 必须引用同一个 Runtime Store Locator。", "source.locator");
    }
    locatorValue = item.source.locator.value;
    assertEvidenceDigest(digestPort, item, evidenceDigest, HarnessErrorCode.InvalidInput);
    return item;
  });

  if (new Set(evidence.map((item) => item.evidenceDigest)).size !== evidence.length) {
    throw invalidInput("Projection 包含重复 Evidence 摘要。", "evidenceDigest");
  }
  const locator = evidence[0]?.source.locator;
  if (locator === undefined || locatorValue === undefined) {
    throw invalidInput("Projection 缺少 Artifact Locator。", "source.locator");
  }
  return {
    artifact,
    artifactDigest,
    locator,
    evidence: [...evidence].sort((left, right) =>
      left.evidenceDigest < right.evidenceDigest
        ? -1
        : left.evidenceDigest > right.evidenceDigest
          ? 1
          : 0,
    ),
  };
}

/** 校验已持久化 Evidence 的内容摘要与路径身份。 */
export function assertPersistedExecutorCompatibilityEvidenceIntegrity(
  evidence: ExecutorCapabilityEvidence,
  expectedDigest: ContentDigest,
  digestPort: ExecutorCompatibilityDigestPort,
): void {
  if (evidence.evidenceDigest !== expectedDigest) {
    throw corruptStore("Evidence 文件身份与记录摘要不匹配。");
  }
  assertEvidenceDigest(digestPort, evidence, expectedDigest, HarnessErrorCode.CorruptStore);
  if (
    evidence.source.locator.kind !== ExecutorEvidenceLocatorKind.RuntimeStore ||
    !isSafeRuntimeStoreLocator(evidence.source.locator.value)
  ) {
    throw corruptStore("Evidence 包含不安全的 Runtime Store Locator。");
  }
  if (!matchesContentAddressedArtifactLocator(evidence)) {
    throw corruptStore("Evidence Runtime Store Locator 未绑定 Artifact 摘要。");
  }
}

/** 校验已持久化 Artifact 仍与 Evidence 绑定摘要一致。 */
export function assertPersistedExecutorCompatibilityArtifactIntegrity(
  artifact: unknown,
  expectedDigest: ContentDigest,
  digestPort: ExecutorCompatibilityDigestPort,
): void {
  assertDigestMatches(
    digestPort,
    artifact,
    expectedDigest,
    "Executor Compatibility source Artifact 摘要不匹配。",
    HarnessErrorCode.CorruptStore,
  );
}

function assertEvidenceDigest(
  digestPort: ExecutorCompatibilityDigestPort,
  evidence: ExecutorCapabilityEvidence,
  expectedDigest: ContentDigest,
  errorCode: HarnessErrorCode,
): void {
  assertDigestMatches(
    digestPort,
    createExecutorCapabilityEvidenceDigestInput(evidence),
    expectedDigest,
    "Executor Compatibility Evidence 摘要不匹配。",
    errorCode,
  );
}

function assertDigestMatches(
  digestPort: ExecutorCompatibilityDigestPort,
  value: unknown,
  expectedDigest: ContentDigest,
  message: string,
  errorCode: HarnessErrorCode,
): void {
  const calculated = digestPort.calculate(value);
  if (calculated.status === ResultStatus.Failure) {
    throw new HarnessError(errorCode, message, {}, calculated.error);
  }
  if (calculated.value !== expectedDigest) throw new HarnessError(errorCode, message);
}

function matchesContentAddressedArtifactLocator(evidence: ExecutorCapabilityEvidence): boolean {
  const digestHex = evidence.source.artifactDigest.slice("sha256:".length);
  return (
    evidence.source.locator.value ===
    `executorCompatibility/${evidence.scope.adapterKind}/${digestHex}.json`
  );
}

function invalidInput(message: string, field: string): HarnessError {
  return new HarnessError(HarnessErrorCode.InvalidInput, message, { field });
}

function corruptStore(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.CorruptStore, message);
}
