import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ExecutorEvidenceLocatorKind } from "../../src/domain/executorCompatibility/index.js";
import {
  Rfc8785Sha256DigestAdapter,
  createCodexCompatibilityEvidenceLocator,
} from "../../src/infrastructure/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const artifactDigestResult = digestAdapter.calculate({ fixture: "codex-compatibility-artifact" });
if (artifactDigestResult.status === ResultStatus.Failure) throw artifactDigestResult.error;
const ARTIFACT_DIGEST = artifactDigestResult.value;
const ARTIFACT_DIGEST_HEX = ARTIFACT_DIGEST.slice("sha256:".length);

describe("Codex 兼容性证据 Locator", () => {
  it.each([
    [
      ExecutorEvidenceLocatorKind.RepositoryPath,
      `artifacts/executorCompatibility/codex/${ARTIFACT_DIGEST_HEX}.json`,
    ],
    [
      ExecutorEvidenceLocatorKind.RuntimeStore,
      `executorCompatibility/codex/${ARTIFACT_DIGEST_HEX}.json`,
    ],
    [ExecutorEvidenceLocatorKind.ExternalUri, `urn:liushi:artifact:${ARTIFACT_DIGEST}`],
  ] as const)("为 %s 生成精确规范 Locator", (kind, expectedValue) => {
    const result = createCodexCompatibilityEvidenceLocator(kind, ARTIFACT_DIGEST);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(result.value).toEqual({ kind, value: expectedValue });
  });

  it("未知 Locator kind 关闭式失败", () => {
    const unsupportedKind = "unsupported" as ExecutorEvidenceLocatorKind;
    const result = createCodexCompatibilityEvidenceLocator(unsupportedKind, ARTIFACT_DIGEST);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Success) {
      throw new Error("预期未知 Locator kind 失败，但实际成功。");
    }
    expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    expect(result.error.message).toBe("Codex compatibility evidence locator kind is unsupported.");
  });
});
