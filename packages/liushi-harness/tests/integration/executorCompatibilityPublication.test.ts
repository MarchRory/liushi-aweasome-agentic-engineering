import { afterEach, describe, expect, it } from "vitest";

import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { ResultStatus, parseContentDigest } from "../../src/common/index.js";
import { ExecutorSupportLevel } from "../../src/domain/executorCompatibility/index.js";
import { EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION } from "../../src/domain/executorCompatibilityPublication/index.js";
import {
  codexCompatibilitySourceFixtureValues,
  createCodexCompatibilitySourceFixture,
} from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => {
  await runtimeStores.cleanup();
});

describe("Executor Compatibility Publication Application", () => {
  it("从精确 Matrix Digest 跨应用实例生成相同且脱敏的 Bundle", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-publication-");
    const fixture = createCodexCompatibilitySourceFixture();
    const writer = createHarnessApplication({ storeRoot });
    const compiled = await writer.compileCodexExecutorCompatibility.execute(fixture);
    if (compiled.status === ResultStatus.Failure) throw compiled.error;
    const input = {
      matrixDigest: compiled.value.matrix.matrixDigest,
      releaseSubject: {
        packageName: "liushi-harness",
        packageVersion: "0.0.0",
        packageDigest: codexCompatibilitySourceFixtureValues.packageTarballDigest,
        repositoryUri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering",
        sourceRevision: "b".repeat(40),
      },
    } as const;

    const first = await writer.createExecutorCompatibilityPublicationBundle.execute(input);
    const second = await createHarnessApplication({
      storeRoot,
    }).createExecutorCompatibilityPublicationBundle.execute(input);

    expect(first.status).toBe(ResultStatus.Success);
    expect(second).toEqual(first);
    if (first.status === ResultStatus.Failure) throw first.error;
    expect(first.value.schemaVersion).toBe(
      EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION,
    );
    expect(first.value.matrix.supportLevel).toBe(ExecutorSupportLevel.Compatible);
    expect(first.value.matrix.evidenceDigests).toHaveLength(12);
    expect(first.value.projections).toHaveLength(2);
    expect(first.value.projections.flatMap((projection) => projection.evidence)).toHaveLength(12);

    const serialized = JSON.stringify(first.value);
    expect(serialized).not.toContain(codexCompatibilitySourceFixtureValues.root);
    for (const privateIdentifier of codexCompatibilitySourceFixtureValues.privateIdentifiers) {
      expect(serialized).not.toContain(privateIdentifier);
    }
  });

  it("只读创建失败时不改变持久化 Matrix", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-publication-readonly-");
    const fixture = createCodexCompatibilitySourceFixture();
    const application = createHarnessApplication({ storeRoot });
    const compiled = await application.compileCodexExecutorCompatibility.execute(fixture);
    if (compiled.status === ResultStatus.Failure) throw compiled.error;
    const before = await application.queryExecutorCompatibility.execute(
      compiled.value.matrix.matrixDigest,
    );
    const failed = await application.createExecutorCompatibilityPublicationBundle.execute({
      matrixDigest: compiled.value.matrix.matrixDigest,
      releaseSubject: {
        packageName: "liushi-harness",
        packageVersion: "0.0.0",
        packageDigest: calculateDifferentDigest(),
        repositoryUri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering",
        sourceRevision: "c".repeat(40),
      },
    });
    const after = await application.queryExecutorCompatibility.execute(
      compiled.value.matrix.matrixDigest,
    );

    expect(failed.status).toBe(ResultStatus.Failure);
    expect(after).toEqual(before);
  });
});

function calculateDifferentDigest() {
  const parsed = parseContentDigest(`sha256:${"f".repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  expect(parsed.value).not.toBe(codexCompatibilitySourceFixtureValues.packageTarballDigest);
  return parsed.value;
}
