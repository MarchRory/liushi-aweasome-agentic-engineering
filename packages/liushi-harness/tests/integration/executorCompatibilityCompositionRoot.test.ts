import { afterEach, describe, expect, it } from "vitest";

import {
  CompileCodexExecutorCompatibilityUseCase,
  QueryExecutorCompatibilityUseCase,
} from "../../src/application/index.js";
import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { ResultStatus } from "../../src/common/index.js";
import { createCodexCompatibilitySourceFixture } from "../support/executorCompatibility/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => {
  await runtimeStores.cleanup();
});

describe("Executor Compatibility Composition Root", () => {
  it("生产应用从真实来源投影，并跨实例复用同一 Runtime Store", async () => {
    const storeRoot = await runtimeStores.create("liushi-executor-compatibility-bootstrap-");
    const fixture = createCodexCompatibilitySourceFixture();
    const writer = createHarnessApplication({ storeRoot });
    expect(writer.compileCodexExecutorCompatibility).toBeInstanceOf(
      CompileCodexExecutorCompatibilityUseCase,
    );
    expect(writer.queryExecutorCompatibility).toBeInstanceOf(QueryExecutorCompatibilityUseCase);

    const compiled = await writer.compileCodexExecutorCompatibility.execute({
      prepareManifest: fixture.prepareManifest,
      activationPlan: fixture.activationPlan,
      hostResult: fixture.hostResult,
    });
    expect(compiled.status).toBe(ResultStatus.Success);
    if (compiled.status === ResultStatus.Failure) throw compiled.error;

    const reader = createHarnessApplication({ storeRoot });
    const queried = await reader.queryExecutorCompatibility.execute(
      compiled.value.matrix.matrixDigest,
    );

    expect(queried).toEqual({
      status: ResultStatus.Success,
      value: { matrix: compiled.value.matrix, recomputed: true },
    });
  });
});
